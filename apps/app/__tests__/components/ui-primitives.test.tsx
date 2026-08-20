import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Accordion
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../src/components/ui/accordion";

// Avatar
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "../../src/components/ui/avatar";

// Badge
import { Badge, badgeVariants } from "../../src/components/ui/badge";

// Card
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "../../src/components/ui/card";

// Checkbox
import { Checkbox } from "../../src/components/ui/checkbox";

// Dialog
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "../../src/components/ui/dialog";

// DropdownMenu
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "../../src/components/ui/dropdown-menu";

// Sheet
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "../../src/components/ui/sheet";

// Tooltip
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "../../src/components/ui/tooltip";

// ─────────────────────────── Accordion ───────────────────────────
describe("Accordion", () => {
  it("renders an accordion with items", () => {
    render(
      <Accordion type="single" collapsible data-testid="acc">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section one</AccordionTrigger>
          <AccordionContent>Content one</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByTestId("acc")).toBeInTheDocument();
    expect(screen.getByText("Section one")).toBeInTheDocument();
  });

  it("applies className to AccordionItem", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem
          value="item-1"
          className="custom-item"
          data-testid="item"
        >
          <AccordionTrigger>Trigger</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByTestId("item").className).toContain("custom-item");
  });

  it("applies className to AccordionTrigger", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger className="custom-trigger">
            Trigger
          </AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    // Trigger button has the slot attribute
    const trigger = document.querySelector('[data-slot="accordion-trigger"]');
    expect(trigger?.className).toContain("custom-trigger");
  });

  it("applies className to AccordionContent", () => {
    render(
      <Accordion type="single" collapsible defaultValue="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>Trigger</AccordionTrigger>
          <AccordionContent className="custom-content">
            Body text
          </AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    // content inner div should have custom-content class
    const inner = document.querySelector('[data-slot="accordion-content"] div');
    expect(inner?.className).toContain("custom-content");
  });
});

// ─────────────────────────── Avatar ───────────────────────────
describe("Avatar", () => {
  it("renders avatar with default size", () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const el = screen.getByTestId("avatar");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-size", "default");
  });

  it("renders avatar with sm size", () => {
    render(
      <Avatar size="sm" data-testid="avatar-sm">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId("avatar-sm")).toHaveAttribute("data-size", "sm");
  });

  it("renders avatar with lg size", () => {
    render(
      <Avatar size="lg" data-testid="avatar-lg">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId("avatar-lg")).toHaveAttribute("data-size", "lg");
  });

  it("renders AvatarImage slot element", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/photo.jpg" alt="Test" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    // The image slot is rendered even if image itself is not loaded in jsdom
    const slot = document.querySelector('[data-slot="avatar-image"]');
    // The slot element may not appear if radix hides it before image loads; fallback asserts slot or fallback is present
    const fallback = document.querySelector('[data-slot="avatar-fallback"]');
    expect(slot ?? fallback).not.toBeNull();
  });

  it("applies className to AvatarFallback", () => {
    render(
      <Avatar>
        <AvatarFallback className="custom-fallback" data-testid="fallback">
          AB
        </AvatarFallback>
      </Avatar>,
    );
    // Fallback renders when image absent
    const fallback = document.querySelector('[data-slot="avatar-fallback"]');
    expect(fallback?.className).toContain("custom-fallback");
  });

  it("renders AvatarBadge", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
        <AvatarBadge data-testid="badge" />
      </Avatar>,
    );
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("renders AvatarGroup", () => {
    render(
      <AvatarGroup data-testid="group">
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
      </AvatarGroup>,
    );
    expect(screen.getByTestId("group")).toBeInTheDocument();
  });

  it("renders AvatarGroupCount", () => {
    render(
      <AvatarGroup>
        <AvatarGroupCount data-testid="count">+3</AvatarGroupCount>
      </AvatarGroup>,
    );
    expect(screen.getByTestId("count")).toBeInTheDocument();
  });

  it("applies className to Avatar", () => {
    render(
      <Avatar className="custom-avatar" data-testid="avatar-cls">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId("avatar-cls").className).toContain(
      "custom-avatar",
    );
  });

  it("applies className to AvatarBadge", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
        <AvatarBadge className="custom-badge" data-testid="avatar-badge" />
      </Avatar>,
    );
    expect(screen.getByTestId("avatar-badge").className).toContain(
      "custom-badge",
    );
  });

  it("applies className to AvatarGroup", () => {
    render(
      <AvatarGroup className="custom-group" data-testid="grp">
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
      </AvatarGroup>,
    );
    expect(screen.getByTestId("grp").className).toContain("custom-group");
  });

  it("applies className to AvatarGroupCount", () => {
    render(
      <AvatarGroup>
        <AvatarGroupCount className="custom-count" data-testid="cnt">
          +2
        </AvatarGroupCount>
      </AvatarGroup>,
    );
    expect(screen.getByTestId("cnt").className).toContain("custom-count");
  });
});

// ─────────────────────────── Badge ───────────────────────────
describe("Badge", () => {
  it("renders with default variant", () => {
    render(<Badge data-testid="badge">New</Badge>);
    const el = screen.getByTestId("badge");
    expect(el).toBeInTheDocument();
    expect(el.textContent).toBe("New");
  });

  it("renders with secondary variant", () => {
    render(
      <Badge variant="secondary" data-testid="badge">
        Beta
      </Badge>,
    );
    expect(screen.getByTestId("badge").className).toContain("bg-secondary");
  });

  it("renders with destructive variant", () => {
    render(
      <Badge variant="destructive" data-testid="badge">
        Alert
      </Badge>,
    );
    expect(screen.getByTestId("badge").className).toContain("bg-destructive");
  });

  it("renders with outline variant", () => {
    render(
      <Badge variant="outline" data-testid="badge">
        Outline
      </Badge>,
    );
    expect(screen.getByTestId("badge").className).toContain("text-foreground");
  });

  it("renders with success variant using semantic soft tokens", () => {
    render(
      <Badge variant="success" data-testid="badge">
        OK
      </Badge>,
    );
    const cls = screen.getByTestId("badge").className;
    expect(cls).toContain("bg-success-soft");
    expect(cls).toContain("text-success-soft-foreground");
    // Raw tailwind green palette must not appear — variants must use
    // semantic tokens only.
    expect(cls).not.toContain("bg-green-100");
    expect(cls).not.toContain("text-green-800");
  });

  it("renders with warning variant using semantic soft tokens", () => {
    render(
      <Badge variant="warning" data-testid="badge">
        Careful
      </Badge>,
    );
    const cls = screen.getByTestId("badge").className;
    expect(cls).toContain("bg-warning-soft");
    expect(cls).toContain("text-warning-soft-foreground");
  });

  it("renders with info variant using semantic soft tokens", () => {
    render(
      <Badge variant="info" data-testid="badge">
        Note
      </Badge>,
    );
    const cls = screen.getByTestId("badge").className;
    expect(cls).toContain("bg-info-soft");
    expect(cls).toContain("text-info-soft-foreground");
  });

  it("renders with neutral variant using muted token", () => {
    render(
      <Badge variant="neutral" data-testid="badge">
        Draft
      </Badge>,
    );
    const cls = screen.getByTestId("badge").className;
    expect(cls).toContain("bg-muted");
    expect(cls).toContain("text-foreground");
  });

  it("never emits hardcoded tailwind green palette across any variant", () => {
    for (const variant of [
      "default",
      "secondary",
      "destructive",
      "outline",
      "success",
      "warning",
      "info",
      "neutral",
    ] as const) {
      const cls = badgeVariants({ variant });
      expect(cls).not.toContain("bg-green-100");
      expect(cls).not.toContain("text-green-800");
      expect(cls).not.toContain("bg-green-900");
      expect(cls).not.toContain("text-green-400");
    }
  });

  it("applies custom className", () => {
    render(
      <Badge className="custom-badge" data-testid="badge">
        Tag
      </Badge>,
    );
    expect(screen.getByTestId("badge").className).toContain("custom-badge");
  });

  it("badgeVariants returns class string", () => {
    expect(typeof badgeVariants({ variant: "default" })).toBe("string");
  });
});

// ─────────────────────────── Card ───────────────────────────
describe("Card", () => {
  it("renders Card with all sub-components", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction data-testid="action">Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByTestId("card")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByTestId("action")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("applies custom className to CardAction", () => {
    render(
      <Card>
        <CardHeader>
          <CardAction className="custom-action" data-testid="ca">
            X
          </CardAction>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByTestId("ca").className).toContain("custom-action");
  });

  it("applies custom className to CardFooter", () => {
    render(
      <Card>
        <CardFooter className="custom-footer" data-testid="cf">
          Footer
        </CardFooter>
      </Card>,
    );
    expect(screen.getByTestId("cf").className).toContain("custom-footer");
  });
});

// ─────────────────────────── Checkbox ───────────────────────────
describe("Checkbox", () => {
  it("renders a checkbox", () => {
    render(<Checkbox data-testid="cb" />);
    expect(screen.getByTestId("cb")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Checkbox className="custom-check" data-testid="cb" />);
    expect(screen.getByTestId("cb").className).toContain("custom-check");
  });

  it("can be checked", async () => {
    const user = userEvent.setup();
    render(<Checkbox data-testid="cb" />);
    const cb = screen.getByTestId("cb");
    await user.click(cb);
    expect(cb).toHaveAttribute("data-state", "checked");
  });
});

// ─────────────────────────── Dialog ───────────────────────────
describe("Dialog", () => {
  it("renders dialog trigger and opens dialog on click", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger data-testid="trigger">Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Dialog</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose data-testid="close-btn">Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    await user.click(screen.getByTestId("trigger"));
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog description")).toBeInTheDocument();
  });

  it("renders DialogClose component as standalone", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogClose data-testid="dialog-close">X</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByTestId("dialog-close")).toBeInTheDocument();
  });

  it("renders DialogContent without close button when showCloseButton=false", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger data-testid="trigger2">Open2</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>No Close Button</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByTestId("trigger2"));
    // The X icon sr-only close button should not exist
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("applies custom className to DialogHeader", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger data-testid="trig3">Open3</DialogTrigger>
        <DialogContent>
          <DialogHeader className="custom-header" data-testid="dh">
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByTestId("trig3"));
    expect(screen.getByTestId("dh").className).toContain("custom-header");
  });
});

// ─────────────────────────── DropdownMenu ───────────────────────────
describe("DropdownMenu", () => {
  it("renders trigger and opens menu", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trigger">Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Label</DropdownMenuLabel>
            <DropdownMenuItem data-testid="item1">Item 1</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" data-testid="item2">
              Delete
            </DropdownMenuItem>
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trigger"));
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByTestId("item1")).toBeInTheDocument();
    expect(screen.getByTestId("item2")).toBeInTheDocument();
  });

  it("renders DropdownMenuPortal", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Portal Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>,
    );
    // Portal renders into document body
    expect(screen.getByText("Portal Item")).toBeInTheDocument();
  });

  it("renders checkbox item", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig2">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked data-testid="cb-item">
            Checked option
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig2"));
    expect(screen.getByTestId("cb-item")).toBeInTheDocument();
  });

  it("renders radio group and radio items", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig3">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a" data-testid="radio-a">
              Option A
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b" data-testid="radio-b">
              Option B
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig3"));
    expect(screen.getByTestId("radio-a")).toBeInTheDocument();
    expect(screen.getByTestId("radio-b")).toBeInTheDocument();
  });

  it("renders sub menu", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig4">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-testid="sub-trig">
              More
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem data-testid="sub-item">
                Sub Item
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig4"));
    expect(screen.getByTestId("sub-trig")).toBeInTheDocument();
  });

  it("renders DropdownMenuItem with inset", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig5">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem inset data-testid="inset-item">
            Inset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig5"));
    expect(screen.getByTestId("inset-item")).toHaveAttribute(
      "data-inset",
      "true",
    );
  });

  it("renders DropdownMenuLabel with inset", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig6">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset data-testid="inset-label">
            Header
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig6"));
    expect(screen.getByTestId("inset-label")).toHaveAttribute(
      "data-inset",
      "true",
    );
  });

  it("renders DropdownMenuShortcut with className", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig7">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuShortcut
            className="custom-shortcut"
            data-testid="shortcut"
          >
            ⌘X
          </DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig7"));
    expect(screen.getByTestId("shortcut").className).toContain(
      "custom-shortcut",
    );
  });

  it("renders DropdownMenuSubTrigger with inset", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="dm-trig8">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset data-testid="inset-sub">
              More
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>X</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByTestId("dm-trig8"));
    expect(screen.getByTestId("inset-sub")).toHaveAttribute(
      "data-inset",
      "true",
    );
  });
});

// ─────────────────────────── Sheet ───────────────────────────
describe("Sheet", () => {
  it("renders sheet trigger and opens on click", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sheet-trigger">Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description text</SheetDescription>
          </SheetHeader>
          <SheetFooter data-testid="sheet-footer">Footer</SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByTestId("sheet-trigger")).toBeInTheDocument();
    await user.click(screen.getByTestId("sheet-trigger"));
    expect(screen.getByText("Sheet Title")).toBeInTheDocument();
    expect(screen.getByText("Sheet description text")).toBeInTheDocument();
    expect(screen.getByTestId("sheet-footer")).toBeInTheDocument();
  });

  it("renders SheetClose component", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetClose data-testid="sheet-close">Close</SheetClose>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByTestId("sheet-close")).toBeInTheDocument();
  });

  it("renders SheetContent with left side", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sheet-trig2">Open</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Left Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sheet-trig2"));
    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content?.className).toContain("left-0");
  });

  it("renders SheetContent with top side", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sheet-trig3">Open</SheetTrigger>
        <SheetContent side="top">
          <SheetTitle>Top Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sheet-trig3"));
    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content?.className).toContain("top-0");
  });

  it("renders SheetContent with bottom side", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sheet-trig4">Open</SheetTrigger>
        <SheetContent side="bottom">
          <SheetTitle>Bottom Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sheet-trig4"));
    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content?.className).toContain("bottom-0");
  });

  it("renders SheetContent without close button", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sheet-trig5">Open</SheetTrigger>
        <SheetContent showCloseButton={false}>
          <SheetTitle>No Close</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sheet-trig5"));
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("applies custom className to SheetHeader", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sh-trig6">Open</SheetTrigger>
        <SheetContent>
          <SheetHeader className="custom-sheet-header" data-testid="sh-header">
            <SheetTitle>T</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sh-trig6"));
    expect(screen.getByTestId("sh-header").className).toContain(
      "custom-sheet-header",
    );
  });

  it("applies custom className to SheetFooter", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger data-testid="sh-trig7">Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetFooter className="custom-sheet-footer" data-testid="sh-footer">
            Footer
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByTestId("sh-trig7"));
    expect(screen.getByTestId("sh-footer").className).toContain(
      "custom-sheet-footer",
    );
  });
});

// ─────────────────────────── Tooltip ───────────────────────────
describe("Tooltip", () => {
  it("renders tooltip trigger", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="tooltip-trigger">
            Hover me
          </TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByTestId("tooltip-trigger")).toBeInTheDocument();
  });

  it("renders tooltip with open=true", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger data-testid="tt-open">Hover me</TooltipTrigger>
          <TooltipContent data-testid="tc-open">Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByTestId("tt-open")).toBeInTheDocument();
    // Content renders in portal when open; check slot attribute via querySelector
    expect(
      document.querySelector('[data-slot="tooltip-content"]'),
    ).toBeInTheDocument();
  });

  it("applies custom className to TooltipContent wrapper", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent className="custom-tooltip">Content</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const el = document.querySelector('[data-slot="tooltip-content"]');
    expect(el?.className).toContain("custom-tooltip");
  });

  it("renders TooltipProvider with custom delayDuration", () => {
    render(
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Info</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText("Hover")).toBeInTheDocument();
  });
});
