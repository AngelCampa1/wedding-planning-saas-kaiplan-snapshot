import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageSpinner } from "../../components/ui/page-spinner";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  ImageUp,
  Link2,
  Rocket,
} from "lucide-react";
import type { GuestWithPlusOnes, WeddingWebsiteDraft } from "@kaiplan/shared";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { StatusBanner } from "../../components/ui/status-banner";
import { Input } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { resolvePublicBaseUrl } from "../../lib/public-site-url";
import { useActiveWedding } from "../../lib/wedding-context";
import { useBillingSummary } from "../../hooks/use-billing";
import { TRIAL_PLAN_HINT } from "../../lib/billing-copy";
import { useGuests } from "../../hooks/use-guests";
import {
  useCreateWeddingWebsiteHouseholdToken,
  usePublishWeddingWebsite,
  useSaveWeddingWebsite,
  useSendWeddingWebsiteRsvpReminders,
  useUnpublishWeddingWebsite,
  useWeddingWebsite,
  useWeddingWebsiteHeroUploadIntent,
  useWeddingWebsiteHouseholdToken,
  useWeddingWebsiteSlugAvailability,
} from "../../hooks/use-website";
import { useWeddings } from "../../hooks/use-weddings";

const MAX_HERO_IMAGE_BYTES = 10 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/website")({
  component: WebsitePage,
});

function createEmptyDraft(weddingId: string): WeddingWebsiteDraft {
  return {
    weddingId,
    slug: "",
    template: "classic",
    content: {
      hero: {
        title: "",
        subtitle: "",
        body: "",
        ctaLabel: "Open RSVP",
      },
      story: {
        title: "Our Story",
        body: "",
      },
      venue: {
        name: "",
        address: "",
        details: "",
        mapUrl: null,
      },
      registry: {
        title: "Registry",
        url: null,
        details: "",
      },
      rsvp: {
        visible: true,
        headline: "Please RSVP",
        details: "",
      },
      heroImage: null,
    },
  };
}

function buildPublicBaseUrl() {
  return resolvePublicBaseUrl();
}

export function WebsitePage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId, setWeddingSwitchGuard } = useActiveWedding();
  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);
  const activeWedding =
    weddings.find((wedding) => wedding.id === resolvedWeddingId) ?? null;
  const canMutate = activeWedding !== null && activeWedding.role !== "viewer";
  const billingSummaryQuery = useBillingSummary();
  const billingSummary = billingSummaryQuery.data;
  const hasBillingSummary = Boolean(billingSummary);
  const hasWebsiteAccess =
    billingSummary?.features.includes("weddingWebsite") ?? false;
  const shouldLoadWebsite = Boolean(resolvedWeddingId);

  const websiteQuery = useWeddingWebsite(
    shouldLoadWebsite ? resolvedWeddingId : null,
  );
  const guestsQuery = useGuests(shouldLoadWebsite ? resolvedWeddingId : null);

  const [draft, setDraft] = useState<WeddingWebsiteDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [selectedPrimaryGuestId, setSelectedPrimaryGuestId] = useState("");
  const [selectedReminderGuestIds, setSelectedReminderGuestIds] = useState<
    string[]
  >([]);
  const [reminderResults, setReminderResults] = useState<string[]>([]);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const heroTitleRef = useRef<HTMLInputElement | null>(null);
  const activeWeddingRef = useRef<string | null>(null);
  const reminderSelectionTouchedRef = useRef(false);

  const saveDraft = useSaveWeddingWebsite(resolvedWeddingId ?? "");
  const publishWebsite = usePublishWeddingWebsite(resolvedWeddingId ?? "");
  const unpublishWebsite = useUnpublishWeddingWebsite(resolvedWeddingId ?? "");
  const slugAvailability = useWeddingWebsiteSlugAvailability(
    resolvedWeddingId ?? "",
  );
  const createHouseholdToken = useCreateWeddingWebsiteHouseholdToken(
    resolvedWeddingId ?? "",
  );
  const lookupHouseholdToken = useWeddingWebsiteHouseholdToken(
    resolvedWeddingId ?? "",
  );
  const sendReminders = useSendWeddingWebsiteRsvpReminders(
    resolvedWeddingId ?? "",
  );
  const heroUploadIntent = useWeddingWebsiteHeroUploadIntent(
    resolvedWeddingId ?? "",
  );

  const areGuestActionsLoading = shouldLoadWebsite && guestsQuery.isLoading;
  const primaryGuests = useMemo(
    () =>
      areGuestActionsLoading
        ? []
        : (guestsQuery.data?.filter((guest) => guest.primaryGuestId === null) ??
          []),
    [areGuestActionsLoading, guestsQuery.data],
  );
  const publicBaseUrl = buildPublicBaseUrl();
  const draftUrl = draft?.slug
    ? `${publicBaseUrl}/w/${draft.slug}/`
    : `${publicBaseUrl}/w/your-slug/`;
  const publishedUrl = draft?.publishedSlug
    ? `${publicBaseUrl}/w/${draft.publishedSlug}/`
    : null;
  const isBusy =
    weddingsLoading ||
    websiteQuery.isLoading ||
    guestsQuery.isLoading ||
    saveDraft.isPending ||
    publishWebsite.isPending ||
    unpublishWebsite.isPending;

  const hasContent = Boolean(
    draft?.slug || draft?.content.hero.title || draft?.content.hero.body,
  );

  useEffect(() => {
    if (!resolvedWeddingId) {
      activeWeddingRef.current = null;
      setDraft(null);
      setDirty(false);
      return;
    }

    if (!shouldLoadWebsite) {
      return;
    }

    if (activeWeddingRef.current !== resolvedWeddingId) {
      activeWeddingRef.current = resolvedWeddingId;
      reminderSelectionTouchedRef.current = false;
      setDraft(websiteQuery.data ?? createEmptyDraft(resolvedWeddingId));
      setDirty(false);
      setMessage(null);
      setErrorMessage(null);
      setSlugStatus(null);
      setInviteLink(null);
      setSelectedReminderGuestIds([]);
      setReminderResults([]);
      return;
    }

    if (!dirty && websiteQuery.status === "success") {
      setDraft(websiteQuery.data ?? createEmptyDraft(resolvedWeddingId));
    }
  }, [
    dirty,
    resolvedWeddingId,
    shouldLoadWebsite,
    websiteQuery.data,
    websiteQuery.status,
  ]);

  useEffect(() => {
    if (primaryGuests.length === 0) {
      if (selectedPrimaryGuestId) {
        setSelectedPrimaryGuestId("");
      }
      if (selectedReminderGuestIds.length > 0) {
        setSelectedReminderGuestIds([]);
      }
      return;
    }

    if (!selectedPrimaryGuestId && primaryGuests.length > 0) {
      setSelectedPrimaryGuestId(primaryGuests[0]!.id);
    }

    if (
      selectedPrimaryGuestId &&
      !primaryGuests.some((guest) => guest.id === selectedPrimaryGuestId)
    ) {
      setSelectedPrimaryGuestId(primaryGuests[0]?.id ?? "");
    }

    if (
      primaryGuests.length > 0 &&
      selectedReminderGuestIds.length === 0 &&
      !reminderSelectionTouchedRef.current
    ) {
      setSelectedReminderGuestIds(primaryGuests.map((guest) => guest.id));
      return;
    }

    const validIds = new Set(primaryGuests.map((guest) => guest.id));
    const filteredIds = selectedReminderGuestIds.filter((id) =>
      validIds.has(id),
    );

    if (filteredIds.length !== selectedReminderGuestIds.length) {
      setSelectedReminderGuestIds(filteredIds);
    }
  }, [primaryGuests, selectedPrimaryGuestId, selectedReminderGuestIds]);

  useEffect(() => {
    setInviteLink(null);
    setCopiedInvite(false);
  }, [publishedUrl, selectedPrimaryGuestId]);

  function updateDraft(nextDraft: WeddingWebsiteDraft) {
    if (!canMutate) return;
    setDraft(nextDraft);
    setDirty(true);
    setMessage(null);
    setErrorMessage(null);
  }

  function updateField(
    section: keyof WeddingWebsiteDraft["content"],
    field: string,
    value: string | boolean | null,
  ) {
    if (!draft || section === "heroImage" || !canMutate) {
      return;
    }

    updateDraft({
      ...draft,
      content: {
        ...draft.content,
        [section]: {
          ...draft.content[section],
          [field]: value,
        },
      },
    });
  }

  useEffect(() => {
    setWeddingSwitchGuard(
      canMutate && dirty
        ? () =>
            window.confirm(
              "You have unsaved website changes. Leave without saving?",
            )
        : null,
    );

    return () => setWeddingSwitchGuard(null);
  }, [canMutate, dirty, setWeddingSwitchGuard]);

  async function handleSaveDraft() {
    if (!draft || !resolvedWeddingId || !canMutate) return;

    try {
      const saved = await saveDraft.mutateAsync({
        slug: draft.slug,
        template: draft.template,
        content: draft.content,
      });
      setDraft(saved);
      setDirty(false);
      setMessage("Draft saved.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save draft.",
      );
    }
  }

  async function handlePublish() {
    if (!draft || !resolvedWeddingId || !canMutate) return;

    try {
      const saved = await saveDraft.mutateAsync({
        slug: draft.slug,
        template: draft.template,
        content: draft.content,
      });
      const published = await publishWebsite.mutateAsync();
      setDraft({
        ...saved,
        publishedSlug: published.publishedSlug ?? published.slug,
        publishedAt: published.publishedAt ?? null,
      });
      setDirty(false);
      setMessage("Website published.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not publish website.",
      );
    }
  }

  async function handleUnpublish() {
    if (
      !canMutate ||
      !window.confirm("Unpublish this website and take the live site offline?")
    ) {
      return;
    }

    try {
      const nextDraft = await unpublishWebsite.mutateAsync();
      setDraft(nextDraft);
      setMessage("Website unpublished.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not unpublish website.",
      );
    }
  }

  async function handleSlugCheck() {
    if (!draft?.slug || !resolvedWeddingId || !canMutate) return;

    try {
      const result = await slugAvailability.mutateAsync(draft.slug);
      setSlugStatus(
        result.available
          ? "Slug is available."
          : "This slug is already in use by another wedding.",
      );
    } catch (error) {
      setSlugStatus(
        error instanceof Error ? error.message : "Could not validate slug.",
      );
    }
  }

  async function handleInviteLink() {
    if (!selectedPrimaryGuestId || !publishedUrl) return;

    try {
      const token = canMutate
        ? await createHouseholdToken.mutateAsync(selectedPrimaryGuestId)
        : await lookupHouseholdToken.mutateAsync(selectedPrimaryGuestId);

      setInviteLink(`${publishedUrl}?token=${token.token}#rsvp`);
      setCopiedInvite(false);
      setMessage("Invite link ready.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not prepare the RSVP link.",
      );
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInvite(true);
    } catch {
      setErrorMessage("Clipboard access is unavailable in this browser.");
    }
  }

  function toggleReminderGuest(primaryGuestId: string) {
    if (!canMutate) return;
    reminderSelectionTouchedRef.current = true;
    setSelectedReminderGuestIds((current) => {
      if (current.includes(primaryGuestId)) {
        return current.filter((id) => id !== primaryGuestId);
      }

      return [...current, primaryGuestId];
    });
  }

  async function handleSendReminders() {
    if (selectedReminderGuestIds.length === 0 || !canMutate) {
      return;
    }

    try {
      const response = await sendReminders.mutateAsync({
        primaryGuestIds: selectedReminderGuestIds,
      });
      setReminderResults(
        response.results.map((result) => {
          const label =
            primaryGuests.find((guest) => guest.id === result.primaryGuestId) ??
            null;
          const guestName = label
            ? getPrimaryGuestLabel(label)
            : result.primaryGuestId;

          switch (result.status) {
            case "sent":
              return `${guestName}: reminder sent`;
            case "skippedOptedOut":
              return `${guestName}: skipped because this guest opted out`;
            case "skippedMissingEmail":
              return `${guestName}: skipped because no email is on file`;
            case "skippedIneligible":
              return `${guestName}: skipped because an RSVP link is unavailable`;
            case "skippedNoWebsite":
              return `${guestName}: skipped because the wedding website is not published`;
            default:
              return `${guestName}: ${result.error ?? "delivery failed"}`;
          }
        }),
      );
      setMessage("Reminder delivery finished.");
      setErrorMessage(null);
    } catch (error) {
      setReminderResults([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not send reminders.",
      );
    }
  }

  async function handleHeroFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !draft || !resolvedWeddingId || !canMutate) {
      return;
    }

    try {
      if (file.size > MAX_HERO_IMAGE_BYTES) {
        throw new Error("Hero image must be 10 MB or smaller.");
      }

      const intent = await heroUploadIntent.mutateAsync({
        contentType: file.type,
        filename: file.name,
      });
      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Cloudflare rejected the hero image upload.");
      }

      updateDraft({
        ...draft,
        content: {
          ...draft.content,
          heroImage: {
            imageId: intent.imageId,
            url: intent.imageUrl,
            alt:
              draft.content.heroImage?.alt ||
              draft.content.hero.title ||
              file.name,
            mimeType: file.type,
          },
        },
      });
      setMessage("Hero image uploaded to the draft.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not upload hero image.",
      );
    } finally {
      event.target.value = "";
    }
  }

  function removeHeroImage() {
    if (!draft || !canMutate) return;
    if (!window.confirm("Remove the hero image from this draft?")) {
      return;
    }

    updateDraft({
      ...draft,
      content: {
        ...draft.content,
        heroImage: null,
      },
    });
  }

  function getPrimaryGuestLabel(guest: GuestWithPlusOnes) {
    return `${guest.firstName} ${guest.lastName}`.trim();
  }

  if (
    weddingsLoading ||
    (shouldLoadWebsite && resolvedWeddingId && !draft && websiteQuery.isLoading)
  ) {
    return <PageSpinner />;
  }

  if (!resolvedWeddingId || weddings.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Create a wedding first</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              The website builder attaches to a wedding workspace. Create or
              select a wedding before publishing a site.
            </p>
            <Button asChild>
              <Link to="/onboarding">Create wedding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (
    billingSummaryQuery.status === "error" &&
    !billingSummary &&
    !websiteQuery.data &&
    !websiteQuery.isLoading
  ) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-2xl">
                  We couldn't load website access right now.
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted">
                <p>
                  Refresh the page and try again. If the problem continues,
                  contact support.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void billingSummaryQuery.refetch();
                  }}
                >
                  Retry billing check
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  if (
    (hasBillingSummary && !hasWebsiteAccess) ||
    (websiteQuery.error instanceof ApiError &&
      websiteQuery.error.status === 402)
  ) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            <Card className="border-accent/40 bg-background">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">
                  Wedding websites are a paid feature
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted">
                <p>
                  Upgrade to a paid plan to publish a wedding website, upload a
                  hero image, and create household RSVP links.
                </p>
                <p className="text-xs italic text-muted">{TRIAL_PLAN_HINT}</p>
                <Button asChild>
                  <Link to="/settings">Review plans in Settings</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Wedding Website
              </h1>
              <p className="mt-1 text-sm text-muted">
                Edit the public site, upload one hero image, and create
                household RSVP links.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 rounded-card border border-border bg-card p-3 shadow-card sm:w-auto sm:flex-row">
              <Button
                variant="outline"
                onClick={handleSlugCheck}
                disabled={!draft?.slug || !canMutate}
                data-help-key="website-slug"
                data-tour="website-slug"
              >
                <Link2 className="h-4 w-4" />
                Check slug
              </Button>
              {publishedUrl ? (
                <Button variant="outline" asChild>
                  <a href={publishedUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    View live site
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <ExternalLink className="h-4 w-4" />
                  View live site
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isBusy || !draft || !canMutate}
                data-help-key="website-publish"
              >
                Save draft
              </Button>
              <Button
                onClick={handlePublish}
                disabled={isBusy || !draft || !canMutate}
                data-help-key="website-publish"
              >
                <Rocket className="h-4 w-4" />
                {publishedUrl ? "Update live site" : "Publish"}
              </Button>
            </div>
          </div>

          {message ? (
            <StatusBanner tone="success" className="rounded-card border">
              {message}
            </StatusBanner>
          ) : null}
          {errorMessage ? (
            <div className="feedback-banner feedback-banner--error">
              {errorMessage}
            </div>
          ) : null}

          {!hasContent && (
            <div className="rounded-card border border-primary/20 bg-primary/5 p-6 text-center">
              <p className="font-heading text-xl text-foreground">
                Your wedding website starts here
              </p>
              <p className="mt-2 text-sm text-muted">
                Add your names, set a slug, and share a beautiful site with your
                guests.
              </p>
              <Button
                type="button"
                variant="link"
                onClick={() => heroTitleRef.current?.focus()}
                disabled={!canMutate}
                className="mt-4"
              >
                Start your site
              </Button>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <fieldset
              className="space-y-6 disabled:pointer-events-none disabled:opacity-70"
              data-help-key="website-editor"
              disabled={!canMutate}
            >
              <Card data-help-key="website-slug">
                <CardHeader>
                  <CardTitle>Website Basics</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Slug</span>
                    <Input
                      value={draft?.slug ?? ""}
                      onChange={(event) => {
                        if (!draft) return;
                        updateDraft({ ...draft, slug: event.target.value });
                        setSlugStatus(null);
                      }}
                      placeholder="anna-and-lee"
                    />
                    {slugStatus ? (
                      <span className="text-xs text-muted">{slugStatus}</span>
                    ) : publishedUrl ? (
                      <span className="text-xs text-muted">
                        Public URL: {publishedUrl}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">
                        Draft URL: {draftUrl}. Publish to make it public.
                      </span>
                    )}
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Template
                    </span>
                    <select
                      value={draft?.template ?? "classic"}
                      onChange={(event) => {
                        if (!draft) return;
                        updateDraft({
                          ...draft,
                          template: event.target
                            .value as WeddingWebsiteDraft["template"],
                        });
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <option value="classic">Classic</option>
                      <option value="modern">Modern</option>
                      <option value="editorial">Editorial</option>
                    </select>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hero</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm">
                      <span className="font-medium text-foreground">Title</span>
                      <Input
                        ref={heroTitleRef}
                        value={draft?.content.hero.title ?? ""}
                        onChange={(event) =>
                          updateField("hero", "title", event.target.value)
                        }
                        placeholder="Anna & Lee"
                      />
                    </label>
                    <label className="space-y-2 text-sm">
                      <span className="font-medium text-foreground">
                        Subtitle
                      </span>
                      <Input
                        value={draft?.content.hero.subtitle ?? ""}
                        onChange={(event) =>
                          updateField("hero", "subtitle", event.target.value)
                        }
                        placeholder="June 12, 2026 · Oaxaca"
                      />
                    </label>
                  </div>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Intro</span>
                    <textarea
                      value={draft?.content.hero.body ?? ""}
                      onChange={(event) =>
                        updateField("hero", "body", event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      placeholder="Welcome your guests and set the tone."
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="space-y-2 text-sm">
                      <span className="font-medium text-foreground">
                        RSVP button label
                      </span>
                      <Input
                        value={draft?.content.hero.ctaLabel ?? ""}
                        onChange={(event) =>
                          updateField("hero", "ctaLabel", event.target.value)
                        }
                        placeholder="Open RSVP"
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        className="hidden"
                        onChange={handleHeroFileChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={heroUploadIntent.isPending}
                        data-help-key="website-editor"
                      >
                        <ImageUp className="h-4 w-4" />
                        {heroUploadIntent.isPending
                          ? "Uploading..."
                          : "Upload hero image"}
                      </Button>
                      {draft?.content.heroImage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={removeHeroImage}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {draft?.content.heroImage ? (
                    <div className="rounded-2xl border border-border bg-surface p-3">
                      <img
                        src={draft.content.heroImage.url}
                        alt={draft.content.heroImage.alt}
                        className="h-56 w-full rounded-xl object-cover"
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card
                data-help-key="website-rsvp-links"
                data-tour="website-rsvp-links"
              >
                <CardHeader>
                  <CardTitle>Story</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Section title
                    </span>
                    <Input
                      value={draft?.content.story.title ?? ""}
                      onChange={(event) =>
                        updateField("story", "title", event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Story copy
                    </span>
                    <textarea
                      value={draft?.content.story.body ?? ""}
                      onChange={(event) =>
                        updateField("story", "body", event.target.value)
                      }
                      rows={5}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    />
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Venue</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Venue name (optional)
                    </span>
                    <Input
                      value={draft?.content.venue.name ?? ""}
                      onChange={(event) =>
                        updateField("venue", "name", event.target.value)
                      }
                      placeholder="The Palm House"
                    />
                    <span className="text-xs text-muted">
                      Leave this blank if you are not ready to share the venue
                      yet.
                    </span>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Address</span>
                    <Input
                      value={draft?.content.venue.address ?? ""}
                      onChange={(event) =>
                        updateField("venue", "address", event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Details</span>
                    <textarea
                      value={draft?.content.venue.details ?? ""}
                      onChange={(event) =>
                        updateField("venue", "details", event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Map URL</span>
                    <Input
                      value={draft?.content.venue.mapUrl ?? ""}
                      onChange={(event) =>
                        updateField(
                          "venue",
                          "mapUrl",
                          event.target.value.trim() ? event.target.value : null,
                        )
                      }
                      placeholder="https://maps.google.com/..."
                    />
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Registry</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Section title
                    </span>
                    <Input
                      value={draft?.content.registry.title ?? ""}
                      onChange={(event) =>
                        updateField("registry", "title", event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Registry URL
                    </span>
                    <Input
                      value={draft?.content.registry.url ?? ""}
                      onChange={(event) =>
                        updateField(
                          "registry",
                          "url",
                          event.target.value.trim() ? event.target.value : null,
                        )
                      }
                      placeholder="https://registry.example.com"
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Details</span>
                    <textarea
                      value={draft?.content.registry.details ?? ""}
                      onChange={(event) =>
                        updateField("registry", "details", event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    />
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>RSVP</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={draft?.content.rsvp.visible ?? true}
                      className="h-4 w-4 rounded border-border accent-primary"
                      onChange={(event) =>
                        updateField("rsvp", "visible", event.target.checked)
                      }
                    />
                    Show the RSVP section on the public site
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Headline
                    </span>
                    <Input
                      value={draft?.content.rsvp.headline ?? ""}
                      onChange={(event) =>
                        updateField("rsvp", "headline", event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Details</span>
                    <textarea
                      value={draft?.content.rsvp.details ?? ""}
                      onChange={(event) =>
                        updateField("rsvp", "details", event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    />
                  </label>
                </CardContent>
              </Card>
            </fieldset>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Live Draft Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="editor-preview-surface rounded-[28px] border border-border p-5">
                    <div className="text-xs uppercase tracking-[0.28em] text-muted">
                      {draft?.template ?? "classic"} template
                    </div>
                    <h2 className="mt-3 font-heading text-3xl text-foreground">
                      {draft?.content.hero.title || "Your names here"}
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                      {draft?.content.hero.subtitle || "Wedding date and city"}
                    </p>
                    <p className="mt-4 text-sm leading-6 text-foreground/80">
                      {draft?.content.hero.body ||
                        "A short welcome message will appear here."}
                    </p>
                    <div className="mt-5 inline-flex rounded-full border border-foreground/10 bg-background px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-foreground">
                      {draft?.content.hero.ctaLabel || "Open RSVP"}
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="font-semibold text-foreground">
                        {draft?.content.story.title || "Our Story"}
                      </div>
                      <p className="mt-2 text-muted">
                        {draft?.content.story.body ||
                          "Tell guests how you met and what this weekend means to you."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="font-semibold text-foreground">
                        {draft?.content.venue.name || "Venue details"}
                      </div>
                      <p className="mt-2 text-muted">
                        {draft?.content.venue.address ||
                          "Address and arrival details"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="font-semibold text-foreground">
                        {draft?.content.registry.title || "Registry"}
                      </div>
                      <p className="mt-2 text-muted">
                        {draft?.content.registry.details ||
                          "Link your registry or leave a gracious note."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Household RSVP Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted">
                    {canMutate
                      ? "Generate a private RSVP link for each primary guest. Their plus-ones ride on the same token."
                      : "Show the private RSVP link for each primary guest. Their plus-ones ride on the same token."}
                  </p>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      Primary guest
                    </span>
                    <select
                      value={selectedPrimaryGuestId}
                      onChange={(event) =>
                        setSelectedPrimaryGuestId(event.target.value)
                      }
                      disabled={areGuestActionsLoading}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {areGuestActionsLoading ? (
                        <option value="">Loading guests...</option>
                      ) : primaryGuests.length === 0 ? (
                        <option value="">No guests available yet</option>
                      ) : null}
                      {primaryGuests.map((guest) => (
                        <option key={guest.id} value={guest.id}>
                          {getPrimaryGuestLabel(guest)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    onClick={handleInviteLink}
                    disabled={
                      areGuestActionsLoading ||
                      !selectedPrimaryGuestId ||
                      !publishedUrl ||
                      createHouseholdToken.isPending ||
                      lookupHouseholdToken.isPending
                    }
                    data-help-key="website-rsvp-links"
                  >
                    <Globe className="h-4 w-4" />
                    {canMutate ? "Generate invite link" : "Show invite link"}
                  </Button>
                  {!publishedUrl ? (
                    <p className="text-xs text-muted">
                      Publish the site first so invite links point to the live
                      page.
                    </p>
                  ) : null}
                  {inviteLink ? (
                    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
                      <p className="break-all text-sm text-foreground">
                        {inviteLink}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCopyInviteLink}
                        >
                          {copiedInvite ? (
                            <>
                              <Check className="h-4 w-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Copy link
                            </>
                          )}
                        </Button>
                        <Button variant="ghost" asChild>
                          <a href={inviteLink} target="_blank" rel="noreferrer">
                            Open RSVP
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="h-px bg-border" />
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Manual RSVP reminders
                      </p>
                      <p className="text-xs text-muted">
                        Choose primary guests and send reminder emails to every
                        selected household.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {areGuestActionsLoading ? (
                        <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted">
                          Loading guests...
                        </div>
                      ) : (
                        primaryGuests.map((guest) => (
                          <label
                            key={guest.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <span>{getPrimaryGuestLabel(guest)}</span>
                            <input
                              type="checkbox"
                              checked={selectedReminderGuestIds.includes(
                                guest.id,
                              )}
                              className="h-4 w-4 rounded border-border accent-primary"
                              disabled={!canMutate}
                              onChange={() => toggleReminderGuest(guest.id)}
                            />
                          </label>
                        ))
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleSendReminders}
                      disabled={
                        areGuestActionsLoading ||
                        selectedReminderGuestIds.length === 0 ||
                        sendReminders.isPending ||
                        !canMutate
                      }
                    >
                      {sendReminders.isPending
                        ? "Sending reminders..."
                        : "Send RSVP reminders"}
                    </Button>
                    {reminderResults.length > 0 ? (
                      <div className="space-y-2 rounded-xl border border-border bg-surface p-3 text-sm text-foreground">
                        {reminderResults.map((result) => (
                          <p key={result}>{result}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card data-help-key="website-publish" data-tour="website-publish">
                <CardHeader>
                  <CardTitle>Publishing Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted">
                  <p>
                    The public site only reads the published snapshot. Save
                    drafts as often as you want without changing the live page.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={isBusy || !draft || !canMutate}
                    >
                      Save draft
                    </Button>
                    <Button
                      onClick={handlePublish}
                      disabled={isBusy || !draft || !canMutate}
                    >
                      Publish live
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleUnpublish}
                      disabled={unpublishWebsite.isPending || !canMutate}
                    >
                      Unpublish
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
