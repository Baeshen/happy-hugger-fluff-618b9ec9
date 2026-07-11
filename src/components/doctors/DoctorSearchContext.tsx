/**
 * DoctorSearchContext — shared filter/sort/search/page state for doctor listings.
 *
 * Two providers with the same public API so the search bar, filters panel, and
 * results grid can be reused in any layout and stay in sync:
 *
 *  - <UrlDoctorSearchProvider /> — /doctors page: state lives in URL search
 *    params (shareable links, back/forward), debounced text input.
 *  - <LocalDoctorSearchProvider /> — embedded widgets (home, specialty, branch
 *    pages): state lives in useState, no URL side effects.
 *
 * Consumers use useDoctorSearch() and don't care which provider is above them.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

export const PER_PAGE = 12;
export const SORT_KEYS = ["rating", "experience", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Gender = "male" | "female" | "";

export type DoctorSearchState = {
  /** Debounced text applied to the filter (URL-persisted when URL-backed). */
  q: string;
  /** Live input value, updated on every keystroke. */
  qInput: string;
  specialty: string[];
  branch: string[];
  gender: Gender;
  language: string[];
  sort: SortKey;
  page: number;
};

export type DoctorSearchActions = {
  setQInput: (v: string) => void;
  setSpecialty: (ids: string[]) => void;
  toggleSpecialty: (id: string) => void;
  setBranch: (ids: string[]) => void;
  toggleBranch: (id: string) => void;
  setGender: (g: Gender) => void;
  setLanguage: (langs: string[]) => void;
  toggleLanguage: (l: string) => void;
  setSort: (s: SortKey) => void;
  setPage: (p: number) => void;
  clearAll: () => void;
};

export type DoctorSearchContextValue = DoctorSearchState &
  DoctorSearchActions & {
    /** Number of active filter constraints (excluding sort/page). */
    activeCount: number;
  };

const Ctx = createContext<DoctorSearchContextValue | null>(null);

export function useDoctorSearch(): DoctorSearchContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useDoctorSearch must be used inside <UrlDoctorSearchProvider> or <LocalDoctorSearchProvider>",
    );
  }
  return v;
}

// ---- shared helpers -------------------------------------------------------

const csvToList = (v: string): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
const listToCsv = (l: string[]): string => l.join(",");

const toggle = (current: string[], id: string): string[] =>
  current.includes(id) ? current.filter((x) => x !== id) : [...current, id];

const clampSort = (s: string | undefined): SortKey =>
  (SORT_KEYS as readonly string[]).includes(s ?? "") ? (s as SortKey) : "rating";

const clampGender = (g: string | undefined): Gender =>
  g === "male" || g === "female" ? g : "";

const computeActive = (s: DoctorSearchState): number =>
  s.specialty.length +
  s.branch.length +
  (s.gender ? 1 : 0) +
  s.language.length +
  (s.q ? 1 : 0);

// ---- URL-backed provider (used by /doctors) -------------------------------

export type UrlSearchParams = {
  q: string;
  specialty: string;
  branch: string;
  gender: string;
  language: string;
  sort: string;
  page: number;
};

type UrlProviderProps = {
  /** Current parsed search params from Route.useSearch(). */
  params: UrlSearchParams;
  /** Route path passed to useNavigate, e.g. "/doctors/". */
  from: string;
  children: ReactNode;
};

export function UrlDoctorSearchProvider({ params, from, children }: UrlProviderProps) {
  const navigate = useNavigate({ from });

  const derived = useMemo<DoctorSearchState>(() => {
    const state = {
      q: params.q,
      qInput: params.q, // seeded; local input state below tracks live typing
      specialty: csvToList(params.specialty),
      branch: csvToList(params.branch),
      gender: clampGender(params.gender),
      language: csvToList(params.language),
      sort: clampSort(params.sort),
      page: Math.max(1, params.page),
    };
    return state;
  }, [params.q, params.specialty, params.branch, params.gender, params.language, params.sort, params.page]);

  // Live text input, debounced writes to URL. Kept in sync with external URL
  // changes (browser back/forward or programmatic navigate).
  const [qInput, setQInputLocal] = useState(derived.q);
  useEffect(() => {
    setQInputLocal(derived.q);
  }, [derived.q]);

  const qTimer = useRef<number | null>(null);
  useEffect(() => {
    if (qInput === derived.q) return;
    if (qTimer.current) window.clearTimeout(qTimer.current);
    qTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, q: qInput, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => {
      if (qTimer.current) window.clearTimeout(qTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const patch = useCallback(
    (p: Partial<Record<string, unknown>>, resetPage = true) => {
      navigate({
        search: (prev) => ({ ...prev, ...p, ...(resetPage ? { page: 1 } : null) }),
        replace: true,
      });
    },
    [navigate],
  );

  const actions = useMemo<DoctorSearchActions>(
    () => ({
      setQInput: setQInputLocal,
      setSpecialty: (ids) => patch({ specialty: listToCsv(ids) }),
      toggleSpecialty: (id) => patch({ specialty: listToCsv(toggle(derived.specialty, id)) }),
      setBranch: (ids) => patch({ branch: listToCsv(ids) }),
      toggleBranch: (id) => patch({ branch: listToCsv(toggle(derived.branch, id)) }),
      setGender: (g) => patch({ gender: g }),
      setLanguage: (langs) => patch({ language: listToCsv(langs) }),
      toggleLanguage: (l) => patch({ language: listToCsv(toggle(derived.language, l)) }),
      setSort: (s) => patch({ sort: s }, false),
      setPage: (p) => patch({ page: Math.max(1, p) }, false),
      clearAll: () =>
        navigate({
          search: () => ({
            q: "",
            specialty: "",
            branch: "",
            gender: "",
            language: "",
            sort: derived.sort,
            page: 1,
          }),
          replace: true,
        }),
    }),
    [patch, navigate, derived.specialty, derived.branch, derived.language, derived.sort],
  );

  const value: DoctorSearchContextValue = {
    ...derived,
    qInput,
    activeCount: computeActive(derived),
    ...actions,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---- Local (in-memory) provider — for embedded widgets --------------------

type LocalProviderProps = {
  initial?: Partial<DoctorSearchState>;
  children: ReactNode;
};

const EMPTY: DoctorSearchState = {
  q: "",
  qInput: "",
  specialty: [],
  branch: [],
  gender: "",
  language: [],
  sort: "rating",
  page: 1,
};

export function LocalDoctorSearchProvider({ initial, children }: LocalProviderProps) {
  const [state, setState] = useState<DoctorSearchState>(() => ({ ...EMPTY, ...initial }));

  // Debounce qInput -> q locally so filtering matches URL-backed behaviour.
  useEffect(() => {
    if (state.qInput === state.q) return;
    const t = window.setTimeout(() => {
      setState((s) => ({ ...s, q: s.qInput, page: 1 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [state.qInput, state.q]);

  const actions = useMemo<DoctorSearchActions>(
    () => ({
      setQInput: (v) => setState((s) => ({ ...s, qInput: v })),
      setSpecialty: (ids) => setState((s) => ({ ...s, specialty: ids, page: 1 })),
      toggleSpecialty: (id) => setState((s) => ({ ...s, specialty: toggle(s.specialty, id), page: 1 })),
      setBranch: (ids) => setState((s) => ({ ...s, branch: ids, page: 1 })),
      toggleBranch: (id) => setState((s) => ({ ...s, branch: toggle(s.branch, id), page: 1 })),
      setGender: (g) => setState((s) => ({ ...s, gender: g, page: 1 })),
      setLanguage: (langs) => setState((s) => ({ ...s, language: langs, page: 1 })),
      toggleLanguage: (l) => setState((s) => ({ ...s, language: toggle(s.language, l), page: 1 })),
      setSort: (sort) => setState((s) => ({ ...s, sort })),
      setPage: (page) => setState((s) => ({ ...s, page: Math.max(1, page) })),
      clearAll: () => setState((s) => ({ ...EMPTY, sort: s.sort })),
    }),
    [],
  );

  const value: DoctorSearchContextValue = {
    ...state,
    activeCount: computeActive(state),
    ...actions,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
