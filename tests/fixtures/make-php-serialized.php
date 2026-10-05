<?php
// Generates real serialize() output for the parser tests.
error_reporting(E_ALL & ~E_DEPRECATED);
class Base { private $secret = 'base-secret'; protected $level = 1; public $name = 'base'; }
class Child extends Base { private $secret = 'child-secret'; protected $tags = ['a', 'b']; public $id = 7; }
enum Suit: string { case Hearts = 'H'; case Spades = 'S'; }
class Legacy implements Serializable {
  public $v = 'x';
  public function serialize() { return 'legacy-data:é'; }
  public function unserialize($d) {}
}
class Modern { public $a = 1; public function __serialize(): array { return ['x' => 1, 0 => 'zero']; } public function __unserialize(array $d): void {} }

function tojson($v) {
  if (is_array($v)) {
    if (array_is_list($v)) return array_map('tojson', $v);
    $o = new stdClass; foreach ($v as $k => $x) { $o->{(string)$k} = tojson($x); } return $o;
  }
  if ($v instanceof UnitEnum) return get_class($v) . '::' . $v->name;
  if (is_object($v)) {
    $o = new stdClass; $o->__class = get_class($v);
    foreach ((array)$v as $k => $x) {
      $name = $k; $decl = null;
      if (is_string($k) && strlen($k) && $k[0] === "\0") { $p = explode("\0", $k); $decl = $p[1]; $name = $p[2]; }
      if (property_exists($o, $name)) $name = ($decl && $decl !== '*') ? "$decl::$name" : "protected:$name";
      $o->{$name} = tojson($x);
    }
    return $o;
  }
  if (is_float($v) && !is_finite($v)) return is_nan($v) ? 'NAN' : ($v > 0 ? 'INF' : '-INF');
  return $v;
}

$shared = new stdClass; $shared->n = 1;
$x = 'same'; $withRefs = ['a' => &$x, 'b' => &$x];
$samples = [
  'multibyte strings' => ['name' => 'Café ☕ 日本語', 'emoji' => '👍🏽', 'ar' => 'مرحبا', 'empty' => ''],
  'nested arrays' => [1, [2, [3, ['deep' => true, 'list' => [null, false, 0]]]], 'k' => [], 10 => 'ten', -5 => 'neg'],
  'scalars' => [-42, PHP_INT_MAX, PHP_INT_MIN, 0.1, 1.0E+25, -0.0, 1.5, true, false, null, INF, -INF],
  'object visibility' => new Child,
  'enum' => ['suit' => Suit::Hearts, 'again' => Suit::Spades],
];
$out = [];
foreach ($samples as $name => $v) {
  $s = serialize($v);
  $out[] = ['name' => $name, 'b64' => base64_encode($s), 'json' => tojson($v)];
}
// Samples with references: expected values are checked by hand in the test.
$o2 = new stdClass; $o2->self = $o2;
foreach ([
  'object reference r:' => [$shared, $shared, 'n' => $shared],
  'php reference R:' => $withRefs,
  'self reference' => $o2,
  'NAN' => NAN,
  'custom Serializable' => [new Legacy],
  '__serialize object' => new Modern,
] as $name => $v) $out[] = ['name' => $name, 'b64' => base64_encode(serialize($v)), 'raw' => serialize($v)];
$out[] = ['name' => 'binary string', 'b64' => base64_encode(serialize("a\x00b\xff\xfe"))];
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_PARTIAL_OUTPUT_ON_ERROR), "\n";
