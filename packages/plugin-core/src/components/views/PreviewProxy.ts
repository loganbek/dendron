import { NoteProps } from "@dendronhq/common-all";

/**
 * Proxy for the Preview Panel. This proxy should be used when trying to access
 * the preview panel for show() operations within plugin-core code.
 */
export interface PreviewProxy {
  /**
   * Method to open or update the preview webview.
   * @param note Optional Note Props to update the preview contents with. If not
   * set, then the default preview behavior should be observed (in the default
   * implementation, it will show the currently opened editor)
   */
  show(
    note?: NoteProps
    // opts?: PreviewProxyOpts
  ): void;

  /**
   * close the preview webview
   */
  hide(): void;

  /**
   * Is the view visible?
   */
  isVisible(): boolean;

  /**
   * Is the view open? A view can be opened but not visible - for example, if a
   * tab for it exists but it's not in focus in the editor group. If a view is
   * open, then it is necessarily visible.
   */
  isOpen(): boolean;
}
