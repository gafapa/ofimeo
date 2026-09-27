// Paths of the spelling dictionaries (scripts/spell-dictionaries.mjs) by
// dictionary id ("es", "en-gb"), without the ".aff.txt" / ".dic.txt" extension.
declare module 'virtual:spell-dictionaries' {
  const paths: Record<string, string>
  export default paths
}
