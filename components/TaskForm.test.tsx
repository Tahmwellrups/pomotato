import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import type { TaskFormValues } from "./TaskForm";
import { TaskForm } from "./TaskForm";

describe("TaskForm", () => {
  describe("validation error display", () => {
    it("displays error for empty title", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const buttons = container.querySelectorAll("button");
      const addBtn = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");
      if (addBtn) {
        await user.click(addBtn as HTMLElement);
      }

      const errorElements = container.querySelectorAll("[role='alert']");
      expect(errorElements.length).toBeGreaterThan(0);
    });

    it("marks invalid field with aria-invalid", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      expect(titleInput.getAttribute("aria-invalid")).toBe("true");
    });

    it("clears errors after successful submit", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      // First submit with empty title
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      expect(titleInput.getAttribute("aria-invalid")).toBe("true");

      // Clear and type a valid title
      await user.clear(titleInput);
      await user.type(titleInput, "Valid Title");

      // Submit
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      // After successful submit, errors should be cleared
      expect(titleInput.getAttribute("aria-invalid")).toBe("false");
    });
  });

  describe("form submission", () => {
    it("submits with Enter key in title field", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      await user.type(titleInput, "Test Task{Enter}");

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).toHaveBeenCalled();
    });

    it("submits with submit button click", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      await user.type(titleInput, "Test Task");
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).toHaveBeenCalled();
    });

    it("submits with correct field values", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const emojiInput = container.querySelector('input[id*="-emoji"]') as HTMLInputElement;
      const etaInput = container.querySelector('input[id*="-eta"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      await user.type(titleInput, "My Task");
      await user.clear(emojiInput);
      await user.type(emojiInput, "🎯");
      await user.clear(etaInput);
      await user.type(etaInput, "5");
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "My Task", emoji: "🎯", eta: 5 }));
    });
  });

  describe("add form (initialValues undefined)", () => {
    it("displays defaults: 🥔 emoji, 1 ETA", () => {
      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={vi.fn()} />);

      const emojiInput = container.querySelector('input[id*="-emoji"]') as HTMLInputElement;
      const etaInput = container.querySelector('input[id*="-eta"]') as HTMLInputElement;

      expect(emojiInput.value).toBe("🥔");
      expect(etaInput.value).toBe("1");
    });

    it("resets fields to defaults after successful submit", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const emojiInput = container.querySelector('input[id*="-emoji"]') as HTMLInputElement;
      const etaInput = container.querySelector('input[id*="-eta"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      await user.type(titleInput, "Test Task");
      await user.clear(emojiInput);
      await user.type(emojiInput, "🎯");
      await user.clear(etaInput);
      await user.type(etaInput, "10");

      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(titleInput.value).toBe("");
      expect(emojiInput.value).toBe("🥔");
      expect(etaInput.value).toBe("1");
    });

    it("does not display Cancel button", () => {
      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={vi.fn()} />);

      const buttons = container.querySelectorAll("button");
      const cancelBtn = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Cancel");
      expect(cancelBtn).toBeUndefined();
    });
  });

  describe("edit form (initialValues provided)", () => {
    const initialValues: TaskFormValues = {
      title: "Existing Task",
      emoji: "🎯",
      colorId: "tomato",
      eta: 5,
    };

    it("pre-fills fields with initialValues", () => {
      const { container } = render(
        <TaskForm
          idPrefix="test"
          initialValues={initialValues}
          submitLabel="Save"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const emojiInput = container.querySelector('input[id*="-emoji"]') as HTMLInputElement;
      const etaInput = container.querySelector('input[id*="-eta"]') as HTMLInputElement;

      expect(titleInput.value).toBe("Existing Task");
      expect(emojiInput.value).toBe("🎯");
      expect(etaInput.value).toBe("5");
    });

    it("displays Cancel button", () => {
      const { container } = render(
        <TaskForm
          idPrefix="test"
          initialValues={initialValues}
          submitLabel="Save"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const buttons = container.querySelectorAll("button");
      const cancelBtn = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Cancel");
      expect(cancelBtn).toBeDefined();
    });

    it("calls onCancel when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      const { container } = render(
        <TaskForm
          idPrefix="test"
          initialValues={initialValues}
          submitLabel="Save"
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      );

      const buttons = container.querySelectorAll("button");
      const cancelButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Cancel");

      if (cancelButton) {
        await user.click(cancelButton as HTMLElement);
      }

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("field uniqueness", () => {
    it("uses idPrefix to create unique field IDs", () => {
      const { container } = render(<TaskForm idPrefix="form1" submitLabel="Add" onSubmit={vi.fn()} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      expect(titleInput.id).toBe("form1-title");
    });
  });

  describe("emoji validation edge cases", () => {
    it("accepts ZWJ sequence emoji", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const emojiInput = container.querySelector('input[id*="-emoji"]') as HTMLInputElement;
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      await user.type(titleInput, "test");
      await user.clear(emojiInput);
      await user.type(emojiInput, "👩‍💻");
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ emoji: "👩‍💻" }));
    });
  });

  describe("color selection", () => {
    it("allows selecting different colors", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const { container } = render(<TaskForm idPrefix="test" submitLabel="Add" onSubmit={onSubmit} />);

      const titleInput = container.querySelector('input[id*="-title"]') as HTMLInputElement;
      const lavenderRadios = container.querySelectorAll('input[name*="-color"]');
      const lavenderRadio = Array.from(lavenderRadios)[4] as HTMLInputElement; // Lavender is the 5th color
      const buttons = container.querySelectorAll("button");
      const submitButton = Array.from(buttons as NodeListOf<HTMLButtonElement>).find((b) => b.textContent === "Add");

      await user.type(titleInput, "test");
      await user.click(lavenderRadio);
      if (submitButton) {
        await user.click(submitButton as HTMLElement);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ colorId: "lavender" }));
    });
  });
});
