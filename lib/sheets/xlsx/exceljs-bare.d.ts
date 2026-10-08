// The bare ExcelJS browser build: UMD, no core-js polyfills. Only xlsx.worker.ts and client.ts import it;
// every other file in lib/sheets/xlsx takes the module as a parameter (ExcelJSModule).
declare module "exceljs/dist/exceljs.bare.min.js" {
  const ExcelJS: typeof import("exceljs");
  export default ExcelJS;
}
