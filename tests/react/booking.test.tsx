/**
 * React component tests — booking/*
 *
 * Covers:
 *  - reducer transitions (set / setPatient / goto clamping / reset)
 *  - validatePatient (valid & invalid Saudi phone/national ID/name)
 *  - formatArDate formatting
 *  - Stepper rendering: active/done state + jump-back callback
 *
 * Run:  bun test tests/react/booking.test.tsx
 */
import "./setup";
import { describe, test, expect, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import {
  reducer,
  INITIAL,
  validatePatient,
  formatArDate,
  type State,
} from "../../src/components/booking/types";
import { Stepper } from "../../src/components/booking/Stepper";

afterEach(cleanup);

// ---- reducer -------------------------------------------------------------

describe("booking reducer", () => {
  test("set merges partial state", () => {
    const s = reducer(INITIAL, { t: "set", p: { serviceType: "clinic", step: 2 } });
    expect(s.serviceType).toBe("clinic");
    expect(s.step).toBe(2);
  });

  test("setPatient merges into patient only", () => {
    const s = reducer(INITIAL, { t: "setPatient", p: { name: "أحمد", phone: "0501234567" } });
    expect(s.patient.name).toBe("أحمد");
    expect(s.patient.phone).toBe("0501234567");
    // other patient fields unchanged
    expect(s.patient.reminder24h).toBe(INITIAL.patient.reminder24h);
  });

  test("goto clamps to [1..9]", () => {
    expect(reducer(INITIAL, { t: "goto", step: 0 }).step).toBe(1);
    expect(reducer(INITIAL, { t: "goto", step: 5 }).step).toBe(5);
    expect(reducer(INITIAL, { t: "goto", step: 42 }).step).toBe(9);
  });

  test("reset returns a fresh INITIAL clone", () => {
    const dirty: State = { ...INITIAL, step: 7, doctorId: "x" };
    const s = reducer(dirty, { t: "reset" });
    expect(s).toEqual(INITIAL);
  });
});

// ---- validatePatient -----------------------------------------------------

describe("validatePatient", () => {
  const base = {
    name: "أحمد الأحمد",
    phone: "0501234567",
    nationalId: "",
    gender: "male" as const,
    reason: "",
    reminder24h: true,
    reminder2h: true,
  };

  test("valid patient (no NID, no reason)", () => {
    const r = validatePatient(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
  });

  test("valid patient with NID and reason", () => {
    const r = validatePatient({ ...base, nationalId: "1234567890", reason: "فحص روتيني" });
    expect(r.ok).toBe(true);
  });

  test("single-word name is rejected", () => {
    const r = validatePatient({ ...base, name: "أحمد" });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeDefined();
  });

  test("invalid saudi phone is rejected", () => {
    const r = validatePatient({ ...base, phone: "0301234567" });
    expect(r.ok).toBe(false);
    expect(r.errors.phone).toBeDefined();
  });

  test("valid international +966 phone accepted", () => {
    const r = validatePatient({ ...base, phone: "+966501234567" });
    expect(r.ok).toBe(true);
  });

  test("NID must start with 1 or 2 and be 10 digits", () => {
    expect(validatePatient({ ...base, nationalId: "3234567890" }).ok).toBe(false);
    expect(validatePatient({ ...base, nationalId: "12345" }).ok).toBe(false);
    expect(validatePatient({ ...base, nationalId: "2000000000" }).ok).toBe(true);
  });

  test("missing gender is rejected", () => {
    const r = validatePatient({ ...base, gender: null });
    expect(r.ok).toBe(false);
    expect(r.errors.gender).toBeDefined();
  });
});

// ---- formatArDate --------------------------------------------------------

describe("formatArDate", () => {
  test("null → dash", () => {
    expect(formatArDate(null, "ar")).toBe("—");
  });

  test("english formatting includes weekday + month + year", () => {
    const s = formatArDate("2026-07-11", "en");
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/July/);
  });

  test("arabic formatting is non-empty for a valid ISO date", () => {
    const s = formatArDate("2026-07-11", "ar");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(4);
    expect(s).not.toBe("—");
  });
});

// ---- Stepper -------------------------------------------------------------

describe("Stepper", () => {
  const steps = ["نوع", "الفرع", "التخصص", "الطبيب", "الوقت", "بيانات", "مراجعة"];

  test("renders all step labels", () => {
    render(<Stepper steps={steps} current={3} onJump={() => {}} />);
    for (const s of steps) expect(screen.getByText(s)).toBeDefined();
  });

  test("past steps are enabled (clickable to jump back), current + future are disabled", () => {
    render(<Stepper steps={steps} current={3} onJump={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(steps.length);
    // buttons at index 0 and 1 (n=1,2 < current=3) are enabled
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
    // button at index 2 (current) is disabled
    expect((buttons[2] as HTMLButtonElement).disabled).toBe(true);
    // future step also disabled
    expect((buttons[5] as HTMLButtonElement).disabled).toBe(true);
  });

  test("clicking a past step calls onJump with its index", () => {
    const calls: number[] = [];
    render(<Stepper steps={steps} current={4} onJump={(i) => calls.push(i)} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[2]);
    expect(calls).toEqual([0, 2]);
  });
});
