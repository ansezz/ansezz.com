/**
 * pgvector storage and index size estimates.
 *
 * Pure functions, no DOM, so the maths can be tested on its own.
 * Every constant below comes from one of these places:
 *   - pgvector README, "Vector Type", "Halfvec Type", "Bit Type" sections:
 *     vector = 4 * dims + 8 bytes, halfvec = 2 * dims + 8, bit = dims / 8 + 8.
 *   - pgvector src/hnsw.h: HNSW element tuple (72 byte header + the value),
 *     neighbor tuple (4 + 6 * (level + 2) * m bytes), layer 0 keeps 2 * m
 *     neighbors, level multiplier ml = 1 / ln(m).
 *   - pgvector src/hnswbuild.c: how element and neighbor tuples are packed
 *     onto 8 KB pages, and what the in-memory graph allocates per element.
 *   - pgvector src/ivfbuild.c and src/ivfkmeans.c: IVFFlat samples
 *     (50 per list, at least 10,000) and the k-means memory check.
 *   - Postgres page layout: 8 KB pages, 24 byte page header, 4 byte line
 *     pointer, 23 byte heap tuple header, TOAST threshold 2032 bytes and
 *     1996 byte TOAST chunks.
 * These are estimates. Real sizes move with dead tuples, fillfactor,
 * concurrent inserts after the build, and the Postgres version.
 */

export type VectorType = "vector" | "halfvec" | "bit";
export type IndexType = "hnsw" | "ivfflat" | "none";

const BLCKSZ = 8192;
const PAGE_HEADER = 24;
const LINE_POINTER = 4;
const MAXALIGN = (n: number): number => Math.ceil(n / 8) * 8;
const INTALIGN = (n: number): number => Math.ceil(n / 4) * 4;

/** Max dimensions pgvector can index, per type (README "HNSW" section). */
export const INDEX_DIM_LIMIT: Record<VectorType, number> = {
  vector: 2000,
  halfvec: 4000,
  bit: 64000,
};

/** Max dimensions a column of each type can store (README reference). */
export const STORE_DIM_LIMIT: Record<VectorType, number> = {
  vector: 16000,
  halfvec: 16000,
  bit: 83886080, // Postgres bit varying limit; not a practical concern here
};

/** Size of one value as a varlena datum, header included (README formulas). */
export function datumBytes(type: VectorType, dims: number): number {
  if (type === "vector") return 4 * dims + 8;
  if (type === "halfvec") return 2 * dims + 8;
  return Math.ceil(dims / 8) + 8;
}

/** Deterministic PRNG so the same inputs always give the same estimate. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** HNSW level for one element, same rule as HnswInitElement. */
function hnswLevel(rand: () => number, ml: number, maxLevel: number): number {
  const u = rand();
  const level = u === 0 ? maxLevel : Math.floor(-Math.log(u) * ml);
  return Math.min(level, maxLevel);
}

const SAMPLE = 20000;

// ── Table ──────────────────────────────────────────────────────────────

export interface TableEstimate {
  /** Heap (main table) bytes. */
  heap: number;
  /** TOAST table bytes, 0 when vectors stay inline. */
  toast: number;
  /** TOAST index bytes. */
  toastIndex: number;
  /** Primary key btree on a bigint id. */
  pkIndex: number;
  /** Whether the vector is moved out of line into TOAST. */
  toasted: boolean;
  /** Bytes of one heap row on the page, line pointer included. */
  rowBytes: number;
  rowsPerPage: number;
}

/**
 * Table shaped like the README example: id bigserial primary key plus one
 * vector column. `extraBytes` is the average stored size of any other
 * columns in a row (text, jsonb, timestamps). It is kept inline in the heap;
 * large text or jsonb values that Postgres would TOAST on their own are out
 * of scope, so keep it to what really stays in the row.
 */
export function estimateTable(
  type: VectorType,
  dims: number,
  rows: number,
  extraBytes = 0,
): TableEstimate {
  const datum = datumBytes(type, dims);
  const HEAP_HEADER = MAXALIGN(23); // no null bitmap
  // id bigint plus the other columns, all stored before the vector.
  const LEAD = 8 + Math.max(0, Math.round(extraBytes));

  // Values this small get a 1 byte varlena header and no alignment.
  const inlineDatum = datum - 3 <= 127 ? datum - 3 : datum;
  const inlineLen =
    datum - 3 <= 127
      ? HEAP_HEADER + LEAD + inlineDatum
      : HEAP_HEADER + INTALIGN(LEAD) + datum;

  const TOAST_THRESHOLD = 2032;
  const toasted = MAXALIGN(inlineLen) > TOAST_THRESHOLD;
  // An external TOAST pointer is 18 bytes with a 1 byte header, unaligned.
  const len = toasted ? HEAP_HEADER + LEAD + 18 : inlineLen;
  const rowBytes = MAXALIGN(len) + LINE_POINTER;
  const usable = BLCKSZ - PAGE_HEADER;
  const rowsPerPage = Math.max(1, Math.min(291, Math.floor(usable / rowBytes)));
  const heap = Math.ceil(rows / rowsPerPage) * BLCKSZ;

  let toast = 0;
  let toastIndex = 0;
  if (toasted && rows > 0) {
    // TOAST stores the value without its 4 byte header, in 1996 byte chunks.
    const raw = datum - 4;
    const CHUNK = 1996;
    const chunks: number[] = [];
    for (let left = raw; left > 0; left -= CHUNK)
      chunks.push(Math.min(CHUNK, left));
    // Chunk tuple: 24 header + chunk_id 4 + chunk_seq 4 + bytea header.
    const tupleSizes = chunks.map((c) =>
      c <= 126 ? MAXALIGN(24 + 8 + 1 + c) : MAXALIGN(24 + 8 + 4 + c),
    );
    // Pack a sample of rows onto pages, then scale.
    const n = Math.min(rows, SAMPLE);
    let pages = 1;
    let free = usable;
    for (let i = 0; i < n; i++) {
      for (const s of tupleSizes) {
        if (free < s + LINE_POINTER) {
          pages++;
          free = usable;
        }
        free -= s + LINE_POINTER;
      }
    }
    toast = Math.ceil((pages * rows) / n) * BLCKSZ;
    toastIndex = btreeBytes(rows * chunks.length, 16);
  }

  const pkIndex = btreeBytes(rows, 16);
  return { heap, toast, toastIndex, pkIndex, toasted, rowBytes, rowsPerPage };
}

/**
 * Rough btree size for an index built by ordered inserts: leaf pages about
 * 90% full (Postgres fills the rightmost page to fillfactor when keys keep
 * growing), plus about 1% for inner pages and the meta page.
 */
function btreeBytes(entries: number, tupleBytes: number): number {
  if (entries <= 0) return 2 * BLCKSZ;
  const usable = (BLCKSZ - PAGE_HEADER - 16) * 0.9;
  const perPage = Math.floor(usable / (tupleBytes + LINE_POINTER));
  const leaves = Math.ceil(entries / perPage);
  return (leaves + Math.ceil(leaves / 100) + 1) * BLCKSZ;
}

// ── HNSW ───────────────────────────────────────────────────────────────

export interface HnswEstimate {
  /** On-disk index size after a fresh build. */
  indexBytes: number;
  /** Bytes per row on disk. */
  bytesPerRow: number;
  /** In-memory graph during a parallel build (shared memory, MAXALIGN only). */
  buildParallel: number;
  /** In-memory graph during a single process build (allocator rounding). */
  buildSerial: number;
  /** Element and neighbor tuple sizes for a level 0 element. */
  elementTuple: number;
  neighborTuple: number;
  /** Whether element and neighbors share a page. */
  samePage: boolean;
}

/** Postgres AllocSet rounds small chunks up to a power of two, plus a header. */
function allocSetChunk(size: number): number {
  const CHUNK_HEADER = 8;
  const LIMIT = 8192;
  if (size > LIMIT) return MAXALIGN(size) + CHUNK_HEADER + 16; // own block
  let p = 8;
  while (p < size) p *= 2;
  return p + CHUNK_HEADER;
}

export function estimateHnsw(
  type: VectorType,
  dims: number,
  rows: number,
  m: number,
): HnswEstimate {
  const datum = datumBytes(type, dims);
  const elementTuple = MAXALIGN(72 + datum);
  const neighborTuple = (level: number) => MAXALIGN(4 + 6 * (level + 2) * m);
  const MAX_SIZE = BLCKSZ - PAGE_HEADER - 8 - LINE_POINTER; // HNSW_MAX_SIZE
  const maxLevel = Math.min(
    Math.floor((BLCKSZ - PAGE_HEADER - 8 - 4 - LINE_POINTER) / 6 / m) - 2,
    63,
  );
  const ml = 1 / Math.log(m);
  const rand = mulberry32(0x9e3779b9 ^ (dims * 31 + m));

  // In-memory element: HnswElementData is 128 bytes on 64-bit builds.
  const ELEMENT_STRUCT = 128;
  const neighborArray = (lm: number) => 8 + 16 * lm;

  const n = Math.max(1, Math.min(rows, SAMPLE));
  let pages = 1; // first data page
  // Page free space as PageGetFreeSpace reports it (minus one line pointer).
  const fresh = BLCKSZ - PAGE_HEADER - 8 - LINE_POINTER;
  let free = fresh;
  let parallel = 0;
  let serial = 0;
  let samePage = true;

  for (let i = 0; i < n; i++) {
    const level = hnswLevel(rand, ml, maxLevel);
    const ntup = neighborTuple(level);
    const combined = elementTuple + ntup + LINE_POINTER;
    if (combined > MAX_SIZE) samePage = false;

    if (free < elementTuple || (combined <= MAX_SIZE && free < combined)) {
      pages++;
      free = fresh;
    }
    free -= elementTuple + LINE_POINTER;
    if (free < ntup) {
      pages++;
      free = fresh;
    }
    free -= ntup + LINE_POINTER;
    if (free < 0) free = 0;

    // Build memory for this element.
    const listPtrs = 8 * (level + 1);
    let arrays = 0;
    let arraysSerial = 0;
    for (let lc = 0; lc <= level; lc++) {
      const a = neighborArray(lc === 0 ? 2 * m : m);
      arrays += MAXALIGN(a);
      arraysSerial += allocSetChunk(a);
    }
    parallel += ELEMENT_STRUCT + MAXALIGN(listPtrs) + arrays + MAXALIGN(datum);
    serial +=
      allocSetChunk(ELEMENT_STRUCT) +
      allocSetChunk(listPtrs) +
      arraysSerial +
      allocSetChunk(datum);
  }

  const scale = rows / n;
  const indexBytes =
    rows > 0 ? (Math.ceil(pages * scale) + 1) * BLCKSZ : 2 * BLCKSZ;
  return {
    indexBytes,
    bytesPerRow: rows > 0 ? indexBytes / rows : 0,
    buildParallel: Math.ceil(parallel * scale),
    buildSerial: Math.ceil(serial * scale),
    elementTuple,
    neighborTuple: neighborTuple(0),
    samePage,
  };
}

// ── IVFFlat ────────────────────────────────────────────────────────────

export interface IvfflatEstimate {
  indexBytes: number;
  bytesPerRow: number;
  /** Memory the k-means step checks against maintenance_work_mem. */
  buildMemory: number;
  samples: number;
}

export function estimateIvfflat(
  type: VectorType,
  dims: number,
  rows: number,
  lists: number,
): IvfflatEstimate {
  const datum = datumBytes(type, dims);
  const L = Math.max(1, Math.round(lists));
  const usable = BLCKSZ - PAGE_HEADER - 8; // IvfflatPageOpaqueData is 8 bytes

  // List pages: one tuple per list holding the center.
  const listTuple = MAXALIGN(8 + datum) + LINE_POINTER;
  const listsPerPage = Math.max(1, Math.floor(usable / listTuple));
  const listPages = Math.ceil(L / listsPerPage);

  // Entry pages: each list is its own chain of pages.
  const valueInIndex = datum - 3 <= 127 ? datum - 3 : datum;
  const entryTuple = MAXALIGN(8 + valueInIndex) + LINE_POINTER;
  const perPage = Math.max(1, Math.floor(usable / entryTuple));
  const perList = rows / L;
  const entryPages =
    rows > 0 ? L * Math.max(1, Math.ceil(perList / perPage)) : L;
  const indexBytes = (1 + listPages + entryPages) * BLCKSZ;

  // Memory, mirroring ComputeCenters and ElkanKmeans.
  const item = MAXALIGN(datum);
  // ivfbuild caps samples at heap pages x MaxHeapTuplesPerPage (291).
  const heapPages = Math.ceil(estimateTable(type, dims, rows).heap / BLCKSZ);
  const maxTuples = Math.max(1, heapPages * 291);
  let S = Math.max(L * 50, 10000);
  S = Math.max(Math.min(S, maxTuples), 1);
  const vecArray = (len: number) => 16 + len * item;
  const F = 4;
  const buildMemory =
    vecArray(L) + // centers
    vecArray(S) + // samples
    vecArray(L) + // new centers
    F * L * dims + // agg
    F * L + // center counts
    F * S + // closest centers
    F * S * L + // lower bounds
    F * S + // upper bounds
    F * L + // s
    F * L * L + // half center distances
    F * L; // new center distances

  return {
    indexBytes,
    bytesPerRow: rows > 0 ? indexBytes / rows : 0,
    buildMemory,
    samples: S,
  };
}

/** README starting point: rows / 1000 up to 1M rows, sqrt(rows) above. */
export function suggestedLists(rows: number): number {
  if (rows <= 0) return 1;
  const v = rows <= 1_000_000 ? rows / 1000 : Math.sqrt(rows);
  return Math.max(1, Math.min(32768, Math.round(v)));
}

/** README starting point for probes: sqrt(lists). */
export function suggestedProbes(lists: number): number {
  return Math.max(1, Math.round(Math.sqrt(lists)));
}

// ── Summary ────────────────────────────────────────────────────────────

export interface PgvectorInputs {
  rows: number;
  dims: number;
  type: VectorType;
  index: IndexType;
  /** HNSW m (pgvector default 16). */
  m: number;
  /** IVFFlat lists. */
  lists: number;
  /** Average bytes of the other columns in one row. */
  extraBytes: number;
}

export interface PgvectorEstimate {
  table: TableEstimate;
  /** Heap + TOAST + TOAST index + primary key. */
  tableBytes: number;
  hnsw: HnswEstimate | null;
  ivfflat: IvfflatEstimate | null;
  /** Vector index bytes, 0 when there is no index. */
  indexBytes: number;
  /** Everything on disk: table, primary key and vector index. */
  totalBytes: number;
  /**
   * RAM to keep the vector index fully cached (shared_buffers plus OS page
   * cache). For fast HNSW search the whole graph should stay in memory.
   */
  ramIndex: number;
  /** Memory to build the index in one pass (maintenance_work_mem target). */
  buildBytes: number;
  /** Whether pgvector can index this many dimensions for this type. */
  indexable: boolean;
}

export function estimatePgvector(i: PgvectorInputs): PgvectorEstimate {
  const rows = Math.max(0, Math.floor(i.rows));
  const dims = Math.max(1, Math.floor(i.dims));
  const table = estimateTable(i.type, dims, rows, i.extraBytes);
  const tableBytes =
    table.heap + table.toast + table.toastIndex + table.pkIndex;
  const indexable = dims <= INDEX_DIM_LIMIT[i.type];

  let hnsw: HnswEstimate | null = null;
  let ivfflat: IvfflatEstimate | null = null;
  let indexBytes = 0;
  let buildBytes = 0;
  if (i.index === "hnsw") {
    const m = Math.min(100, Math.max(2, Math.round(i.m)));
    hnsw = estimateHnsw(i.type, dims, rows, m);
    indexBytes = hnsw.indexBytes;
    buildBytes = hnsw.buildSerial;
  } else if (i.index === "ivfflat") {
    ivfflat = estimateIvfflat(
      i.type,
      dims,
      rows,
      Math.min(32768, Math.max(1, Math.round(i.lists))),
    );
    indexBytes = ivfflat.indexBytes;
    buildBytes = ivfflat.buildMemory;
  }

  return {
    table,
    tableBytes,
    hnsw,
    ivfflat,
    indexBytes,
    totalBytes: tableBytes + indexBytes,
    ramIndex: indexBytes,
    buildBytes,
    indexable,
  };
}

/** Formats bytes the way pg_size_pretty does: 1024 steps, kB/MB/GB/TB. */
export function prettySize(bytes: number): string {
  const units = ["bytes", "kB", "MB", "GB", "TB", "PB"];
  let v = bytes;
  let u = 0;
  while (Math.abs(v) >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  if (u === 0) return `${Math.round(v)} bytes`;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[u]}`;
}
