import {
  BulkResp,
  DendronCompositeError,
  DendronError,
  DNoteLoc,
  ERROR_SEVERITY,
  ERROR_STATUS,
  FindNoteOpts,
  genHash,
  IDataStore,
  IDendronError,
  IFileStore,
  INoteStore,
  isNotUndefined,
  NoteProps,
  NotePropsMeta,
  NoteUtils,
  RespV3,
} from "@dendronhq/common-all";
import { DLogger } from "@dendronhq/common-server";
import _ from "lodash";

/**
 * Responsible for storing NoteProps non-metadata and NoteProps metadata
 */
export class NoteStore implements INoteStore<string> {
  private _fileStore: IFileStore;
  private _metadataStore: IDataStore<string, NotePropsMeta>;
  private _wsRoot: string;
  private _logger: DLogger;

  constructor(
    fileStore: IFileStore,
    dataStore: IDataStore<string, NotePropsMeta>,
    wsRoot: string,
    logger: DLogger
  ) {
    this._fileStore = fileStore;
    this._metadataStore = dataStore;
    this._wsRoot = wsRoot;
    this._logger = logger;
  }

  /**
   * See {@link INoteStore.get}
   */
  async get(key: string): Promise<RespV3<NoteProps>> {
    const ctx = "NoteStore:get";
    this._logger.info({ ctx, msg: `Getting NoteProps for ${key}` });
    const metadata = await this.getMetadata(key);
    if (metadata.error) {
      return { error: metadata.error };
    }
    const fpath = NoteUtils.getFullPath({
      note: metadata.data,
      wsRoot: this._wsRoot,
    });
    const nonMetadata = await this.getNonMetadata(fpath);
    if (nonMetadata.error) {
      return { error: nonMetadata.error };
    }

    // Parse file for note body since we don't have that in metadata
    const capture = nonMetadata.data.match(/^---[\s\S]+?---/);
    if (capture) {
      const offset = capture[0].length;
      const body = nonMetadata.data.slice(offset + 1);
      // add `contentHash` to this signature because its not saved with metadata
      const note = {
        ...metadata.data,
        body,
        contentHash: genHash(nonMetadata.data),
      };
      return { data: note };
    } else {
      return {
        error: DendronError.createFromStatus({
          status: ERROR_STATUS.BAD_PARSE_FOR_NOTE,
          message: `Frontmatter missing for file ${fpath} associated with note ${key}.`,
          severity: ERROR_SEVERITY.MINOR,
        }),
      };
    }
  }

  /**
   * See {@link INoteStore.getMetadata}
   */
  async getMetadata(key: string): Promise<RespV3<NotePropsMeta>> {
    const resp = await this._metadataStore.get(key);
    if (resp.error) {
      return { error: resp.error };
    }
    return { data: resp.data };
  }

  /**
   * See {@link INoteStore.getNonMetadata}
   */
  async getNonMetadata(fpath: string): Promise<RespV3<string>> {
    return this._fileStore.read(fpath);
  }

  /**
   * See {@link INoteStore.find}
   */
  async find(opts: FindNoteOpts): Promise<BulkResp<NoteProps[]>> {
    const noteMetadata = await this.findMetaData(opts);
    if (noteMetadata.error) {
      return { error: new DendronCompositeError([noteMetadata.error]) };
    }

    const responses = await Promise.all(
      noteMetadata.data.map((noteMetadata) => this.get(noteMetadata.id))
    );
    const errors: IDendronError[] = [];
    const data: NoteProps[] = [];
    responses.forEach((resp) => {
      if (resp.error) {
        errors.push(resp.error);
      } else {
        data.push(resp.data);
      }
    });
    return {
      error: errors.length > 0 ? new DendronCompositeError(errors) : null,
      data: data.filter(isNotUndefined),
    };
  }

  /**
   * See {@link INoteStore.findMetaData}
   */
  async findMetaData(opts: FindNoteOpts): Promise<RespV3<NotePropsMeta[]>> {
    const resp = await this._metadataStore.find(opts);
    if (resp.error) {
      return { error: resp.error };
    }
    return { data: resp.data };
  }

  /**
   * See {@link INoteStore.write}
   */
  async write(key: string, note: NoteProps): Promise<RespV3<string>> {
    const metaResp = await this.writeMetadata(key, note);
    if (metaResp.error) {
      return { error: metaResp.error };
    }

    const fpath = NoteUtils.getFullPath({
      note,
      wsRoot: this._wsRoot,
    });
    const content = NoteUtils.serialize(note, { excludeStub: true });
    const writeResp = await this._fileStore.write(fpath, content);
    if (writeResp.error) {
      return { error: writeResp.error };
    }

    return { data: key };
  }

  /**
   * See {@link INoteStore.writeMetadata}
   */
  async writeMetadata(key: string, note: NoteProps): Promise<RespV3<string>> {
    // Ids don't match, return error
    if (key !== note.id) {
      return {
        error: DendronError.createFromStatus({
          status: ERROR_STATUS.WRITE_FAILED,
          message: `Ids don't match between key ${key} and note ${note}.`,
          severity: ERROR_SEVERITY.MINOR,
        }),
      };
    }
    const metadata: NotePropsMeta = _.omit(note, "body");
    const metaResp = await this._metadataStore.write(key, metadata);
    if (metaResp.error) {
      return { error: metaResp.error };
    }

    return { data: key };
  }

  /**
   * See {@link INoteStore.delete}
   */
  async delete(key: string): Promise<RespV3<string>> {
    const metadata = await this.getMetadata(key);
    if (metadata.error) {
      return { error: metadata.error };
    }
    const fpath = NoteUtils.getFullPath({
      note: metadata.data,
      wsRoot: this._wsRoot,
    });
    const deleteResp = await this._fileStore.delete(fpath);
    if (deleteResp.error) {
      return { error: deleteResp.error };
    }
    const metaResp = await this._metadataStore.delete(key);
    if (metaResp.error) {
      return { error: metaResp.error };
    }

    return { data: key };
  }

  async rename(oldLoc: DNoteLoc, newLoc: DNoteLoc): Promise<RespV3<string>> {
    // TODO: implement
    const test = oldLoc.fname + newLoc.fname;
    return { data: test };
  }
}
