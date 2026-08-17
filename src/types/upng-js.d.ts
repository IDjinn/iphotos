/** upng-js ships no types — minimal surface used by the ML preprocessor. */
declare module 'upng-js' {
  interface DecodedPng {
    width: number;
    height: number;
    depth: number;
    ctype: number;
  }

  const UPNG: {
    decode(buffer: ArrayBuffer | Uint8Array): DecodedPng;
    toRGBA8(png: DecodedPng): ArrayBuffer[];
  };

  export default UPNG;
}
