const SHOW_REPLY_CHOICES_KEY = 'vc-show-reply-choices';

/** Whether tap-to-reply choice buttons are shown in chat (default: on). */
export function readShowReplyChoices(): boolean {
  try {
    return localStorage.getItem(SHOW_REPLY_CHOICES_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeShowReplyChoices(show: boolean): void {
  try {
    localStorage.setItem(SHOW_REPLY_CHOICES_KEY, String(show));
  } catch {
    /* ignore quota / private mode */
  }
}
