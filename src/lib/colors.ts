export function buildPersonColorMap(keys: string[]): Map<string, string> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  unique.sort();
  const n = Math.max(unique.length, 1);
  const map = new Map<string, string>();
  unique.forEach((key, i) => {
    const hue = Math.round((i * 360) / n);
    // Alternate saturation/lightness slightly so adjacent hues read as distinct.
    const sat = i % 2 === 0 ? 72 : 58;
    const light = i % 3 === 0 ? 44 : 40;
    map.set(key, `hsl(${hue}, ${sat}%, ${light}%)`);
  });
  return map;
}

export function colorForPerson(
  key: string,
  colorMap?: Map<string, string>
): string {
  if (colorMap && colorMap.has(key)) return colorMap.get(key)!;
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue}, 65%, 42%)`;
}
