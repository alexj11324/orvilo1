import { LexicalEditor } from "lexical";
//#region src/editor-kernel/data-source.d.ts
interface IWriteOptions {
  selection?: boolean;
}
declare class DataSource {
  protected dataType: string;
  constructor(dataType: string);
  get type(): string;
  read(editor: LexicalEditor, data: any, options?: Record<string, unknown>): void;
  write(editor: LexicalEditor, options?: IWriteOptions): any;
}
//#endregion
export { IWriteOptions, DataSource as default };