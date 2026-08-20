import { useEffect, useRef, useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageSpinner } from "../../components/ui/page-spinner";
import { CheckSquare2 } from "lucide-react";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../components/ui/accordion";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useWeddings } from "../../hooks/use-weddings";
import { useActiveWedding } from "../../lib/wedding-context";
import {
  useChecklist,
  useUpdateChecklistTask,
  useSeedChecklist,
  useCreateChecklistTask,
} from "../../hooks/use-checklist";
import { BUCKET_LABELS, MILESTONE_BUCKETS } from "@kaiplan/shared";
import type { MilestoneBucket, ChecklistTask } from "@kaiplan/shared";

export const Route = createFileRoute("/_authenticated/checklist")({
  component: ChecklistPage,
});

export function ChecklistPage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId } = useActiveWedding();

  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);

  const {
    data,
    isLoading: checklistLoading,
    error,
    refetch,
  } = useChecklist(resolvedWeddingId);
  const updateTask = useUpdateChecklistTask(resolvedWeddingId ?? "");
  const seedChecklist = useSeedChecklist(resolvedWeddingId ?? "");
  const createTask = useCreateChecklistTask(resolvedWeddingId ?? "");

  const [addingToBucket, setAddingToBucket] = useState<MilestoneBucket | null>(
    null,
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const userHasToggledRef = useRef(false);
  const [openBuckets, setOpenBuckets] = useState<MilestoneBucket[]>([]);

  const hasSeededRef = useRef(false);
  const seededForWeddingRef = useRef<string | null>(null);

  const seedFn = seedChecklist.mutate;
  const seedIsPending = seedChecklist.isPending;
  const seedIsError = seedChecklist.isError;

  useEffect(() => {
    if (resolvedWeddingId !== seededForWeddingRef.current) {
      hasSeededRef.current = false;
      seededForWeddingRef.current = resolvedWeddingId;
    }

    if (
      resolvedWeddingId &&
      data &&
      data.totalCount === 0 &&
      !error &&
      !hasSeededRef.current &&
      !seedIsPending &&
      !seedIsError
    ) {
      hasSeededRef.current = true;
      seedFn();
    }
  }, [resolvedWeddingId, data, error, seedFn, seedIsPending, seedIsError]);

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const totalCount = data?.totalCount ?? 0;
  const completedCount = data?.completedCount ?? 0;

  const defaultOpenBucketsFromData = useMemo(() => {
    if (!data) return null;
    const tasksByBucketLocal = MILESTONE_BUCKETS.reduce<
      Record<MilestoneBucket, ChecklistTask[]>
    >(
      (acc, bucket) => {
        acc[bucket] = tasks.filter((t) => t.bucket === bucket);
        return acc;
      },
      {} as Record<MilestoneBucket, ChecklistTask[]>,
    );
    return MILESTONE_BUCKETS.filter((bucket) =>
      tasksByBucketLocal[bucket].some((t) => t.completedAt === null),
    );
  }, [data, tasks]);

  useEffect(() => {
    if (userHasToggledRef.current || defaultOpenBucketsFromData === null) {
      return;
    }
    setOpenBuckets(defaultOpenBucketsFromData);
  }, [defaultOpenBucketsFromData]);
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const tasksByBucket = useMemo(
    () =>
      MILESTONE_BUCKETS.reduce<Record<MilestoneBucket, ChecklistTask[]>>(
        (acc, bucket) => {
          acc[bucket] = tasks.filter((t) => t.bucket === bucket);
          return acc;
        },
        {} as Record<MilestoneBucket, ChecklistTask[]>,
      ),
    [tasks],
  );

  function handleToggle(task: ChecklistTask, checked: boolean) {
    if (error) return;

    updateTask.mutate({
      taskId: task.id,
      data: {
        completedAt: checked ? new Date().toISOString() : null,
      },
    });
  }

  function handleAddTask(bucket: MilestoneBucket) {
    if (error) return;
    if (!newTaskTitle.trim()) return;

    createTask.mutate(
      { title: newTaskTitle.trim(), bucket },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setAddingToBucket(null);
        },
      },
    );
  }

  if (weddingsLoading || checklistLoading) {
    return <PageSpinner />;
  }

  if (!resolvedWeddingId) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            Create a wedding first
          </h1>
          <p className="mt-2 text-sm text-muted">
            The checklist attaches to a wedding workspace. Create or select a
            wedding before tracking milestones.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Create wedding</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <>
        <main className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Checklist
              </h1>
              <p className="mt-1 text-sm text-muted">
                Track every milestone from 12+ months out through your wedding
                day.
              </p>
            </div>

            <div
              className="rounded-xl border border-border bg-background p-6"
              role="alert"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Checklist did not load
                  </h2>
                  <p className="max-w-xl text-sm text-muted">
                    Refresh the page and try again. If the problem continues,
                    contact support.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  Retry checklist
                </Button>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Page heading */}
          <div>
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Checklist
            </h1>
            <p className="mt-1 text-sm text-muted">
              Track every milestone from 12+ months out through your wedding
              day.
            </p>
          </div>

          {/* Progress section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {completedCount} / {totalCount} tasks complete
              </span>
              <Badge variant={progressPercent === 100 ? "success" : "outline"}>
                {progressPercent}%
              </Badge>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Checklist completion progress"
              className="h-2 w-full rounded-full bg-muted/30 overflow-hidden"
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Task accordion by bucket */}
          <Accordion
            type="multiple"
            value={openBuckets}
            data-help-key="checklist-buckets"
            data-tour="checklist-buckets"
            onValueChange={(value) => {
              userHasToggledRef.current = true;
              setOpenBuckets(value as MilestoneBucket[]);
            }}
          >
            {MILESTONE_BUCKETS.map((bucket) => {
              const bucketTasks = tasksByBucket[bucket];
              const bucketCompleted = bucketTasks.filter(
                (t) => t.completedAt !== null,
              ).length;

              return (
                <AccordionItem key={bucket} value={bucket}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <CheckSquare2 className="h-4 w-4 text-primary shrink-0" />
                      <span>{BUCKET_LABELS[bucket]}</span>
                      <Badge variant="outline" className="ml-1 font-normal">
                        {bucketCompleted}/{bucketTasks.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {bucketTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/10"
                        >
                          <Checkbox
                            id={`task-${task.id}`}
                            aria-labelledby={`label-task-${task.id}`}
                            checked={task.completedAt !== null}
                            onCheckedChange={(checked) =>
                              handleToggle(task, checked === true)
                            }
                          />
                          <label
                            id={`label-task-${task.id}`}
                            htmlFor={`task-${task.id}`}
                            className={`flex-1 cursor-pointer text-sm ${task.completedAt !== null ? "line-through text-muted" : "text-foreground"}`}
                          >
                            {task.title}
                          </label>
                        </div>
                      ))}

                      {/* Add task form for this bucket */}
                      {addingToBucket === bucket ? (
                        <div className="flex items-center gap-2 px-2 pt-1">
                          <input
                            autoFocus
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddTask(bucket);
                              if (e.key === "Escape") {
                                setAddingToBucket(null);
                                setNewTaskTitle("");
                              }
                            }}
                            placeholder="Task title…"
                            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddTask(bucket)}
                            disabled={!newTaskTitle.trim()}
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setAddingToBucket(null);
                              setNewTaskTitle("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          data-help-key="checklist-add-task"
                          data-tour="checklist-add-task"
                          onClick={() => {
                            setAddingToBucket(bucket);
                            setNewTaskTitle("");
                          }}
                          className="px-2 py-1 text-xs text-muted hover:text-foreground transition-colors"
                        >
                          + Add task
                        </button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </main>
    </>
  );
}
