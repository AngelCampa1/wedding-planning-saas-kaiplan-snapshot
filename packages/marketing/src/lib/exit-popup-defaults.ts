/** Default copy strings for ExitIntentPopup. Override via SiteConfig.copy.exitPopup. */
export const EXIT_POPUP_DEFAULTS = {
  declineText: "No thanks, I'll figure it out myself",
  privacyNote: "No spam. Unsubscribe anytime.",
  successMessage: "Check your inbox!",
  errorInvalidEmail: "Please enter a valid email address.",
  errorDuplicate:
    "You've already signed up — check your inbox for your confirmation email.",
  errorGeneric: "Something went wrong. Try again.",
} as const;
