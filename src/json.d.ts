// The league data files are large; typed through src/engine/types.ts instead
// of letting the compiler infer types from their contents.
declare module "*.json" {
  const value: unknown;
  export default value;
}
