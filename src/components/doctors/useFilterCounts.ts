/**
 * useFilterCounts — live match counts per filter option, computed against the
 * current filter combination MINUS the dimension being counted. This gives
 * the standard "faceted search" preview: each option shows how many results
 * you'd see if you toggled it on (leaving other filters intact).
 */
import { useMemo } from "react";
import { useDoctorSearch } from "./DoctorSearchContext";
import type { DoctorRow } from "./types";

export type FilterCounts = {
  specialty: Record<string, number>;
  branch: Record<string, number>;
  gender: { male: number; female: number };
  language: Record<string, number>;
};

export function useFilterCounts(doctors: DoctorRow[]): FilterCounts {
  const { q, specialty, branch, gender, language } = useDoctorSearch();

  return useMemo(() => {
    const query = q.trim().toLowerCase();

    const matchQuery = (d: DoctorRow) => {
      if (!query) return true;
      const name = `${d.name_ar} ${d.name_en}`.toLowerCase();
      const spec = `${d.specialty_name_ar ?? ""} ${d.specialty_name_en ?? ""}`.toLowerCase();
      return name.includes(query) || spec.includes(query);
    };
    const matchSpecialty = (d: DoctorRow) =>
      !specialty.length || (d.specialty_id != null && specialty.includes(d.specialty_id));
    const matchBranch = (d: DoctorRow) => {
      if (!branch.length) return true;
      const ids = d.branch_ids ?? [];
      return ids.some((b) => branch.includes(b));
    };
    const matchGender = (d: DoctorRow) => !gender || d.gender === gender;
    const matchLanguage = (d: DoctorRow) => {
      if (!language.length) return true;
      const langs = d.languages ?? [];
      return language.every((l) => langs.includes(l));
    };

    const spec: Record<string, number> = {};
    const br: Record<string, number> = {};
    const lang: Record<string, number> = {};
    const gen = { male: 0, female: 0 };

    for (const d of doctors) {
      if (!matchQuery(d)) continue;

      // Specialty counts: apply all filters EXCEPT specialty.
      if (matchBranch(d) && matchGender(d) && matchLanguage(d) && d.specialty_id) {
        spec[d.specialty_id] = (spec[d.specialty_id] ?? 0) + 1;
      }

      // Branch counts: apply all EXCEPT branch.
      if (matchSpecialty(d) && matchGender(d) && matchLanguage(d)) {
        for (const b of d.branch_ids ?? []) {
          br[b] = (br[b] ?? 0) + 1;
        }
      }

      // Gender counts: apply all EXCEPT gender.
      if (matchSpecialty(d) && matchBranch(d) && matchLanguage(d)) {
        if (d.gender === "male") gen.male += 1;
        else if (d.gender === "female") gen.female += 1;
      }

      // Language counts: apply all EXCEPT language.
      if (matchSpecialty(d) && matchBranch(d) && matchGender(d)) {
        for (const l of d.languages ?? []) {
          lang[l] = (lang[l] ?? 0) + 1;
        }
      }
    }

    return { specialty: spec, branch: br, gender: gen, language: lang };
  }, [doctors, q, specialty, branch, gender, language]);
}
