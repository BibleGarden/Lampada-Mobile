export type LinkOpener = (url: string) => Promise<unknown>;
export type LinkAlert = (title: string, message: string) => void;
export type LinkTranslator = (key: string) => string;

export async function openExternalUrl(
  url: string, t: LinkTranslator, openUrl: LinkOpener, showAlert: LinkAlert,
): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    showAlert(t('externalLink.openFailed'), t('externalLink.tryAgain'));
  }
}
