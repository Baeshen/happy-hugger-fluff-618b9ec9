## الهدف

إضافة اختبارات للتحقق من مشغّل `log_reminder_preference_change`:
1. `reason` يُقرأ من `app.change_reason` (GUC) عند التحديث.
2. `changed_by` = `auth.uid()` للموظّف، و `NULL` للـ self_service.
3. `source` = `"staff"` عند تحديث من admin/reception، و `"self_service"` عند تحديث بدون auth (عبر RPC عام).

## الملف الجديد

`tests/rls/reminder-preference-audit-trigger.test.ts` — بنفس نمط الملف الحالي (bun script، ليس vitest).

## السيناريوهات (5 اختبارات)

### staff path (تحديث مباشر من موظّف مسجّل دخول)

مستخدم `reception` يسجّل دخول ثم:
1. يستدعي `admin.rpc('set_config', ...)` — لكن هذا غير متاح للـ authenticated. البديل: استخدام `postgres` RPC مخصّصة أو تنفيذ SQL عبر `admin` (service_role) مع تعيين GUC ثم UPDATE. لكن `service_role` يتجاوز RLS و `auth.uid()` = NULL.

**الحل الصحيح:** المسار الحقيقي لتعيين reason من موظّف هو عبر دالة موجودة مثل `update_appointment_notes(_id, _notes, _reason)` أو استدعاء `update_appointment_status`. لكن هذه لا تُغيّر `reminder_*`. لا توجد RPC موظّف لتحديث التذكيرات مع reason.

**نهج عملي:** إنشاء دالة اختبار مؤقّتة (`_test_update_reminders_as_staff`) عبر migration — أو الأفضل: استخدام RPC عامة مؤقتة قابلة للاستدعاء داخل الاختبار. لكن هذا يتطلب migration.

**البديل الأنظف بلا migration:** استخدام `admin.rpc('exec_sql', ...)` — غير متوفر. أو استعمال `pg` مباشرة عبر `PGHOST`. الاختبار الحالي يستخدم `@supabase/supabase-js` فقط.

**قرار:** الاختبارات تُغطّي المسارات الفعلية المتاحة عبر الـ API الحقيقي:

1. **self_service via RPC** (`update_reminders_by_ref`) — anon يستدعي الـ RPC:
   - يتحقّق أن صف audit جديد يظهر بـ `source='self_service'`، `changed_by IS NULL`، و `reason IS NULL` (لأن `update_reminders_by_ref` لا يعيّن `app.change_reason`).

2. **staff via direct UPDATE** — reception يسجّل دخول ثم يحدّث `appointments.reminder_24h`:
   - يتحقّق: `source='staff'`، `changed_by=<reception uid>`، `reason IS NULL` (لم يعيّن GUC).

3. **staff via direct UPDATE مع set_config عبر service_role trick** — نتجنّبها لأنها تختلط بين actor وservice_role.

**بدلاً من ذلك، لتغطية قراءة `reason` من `app.change_reason`:**

3. **service_role مع set_config**: `admin.rpc(...)` عبر دالة مساعدة تُنشأ في migration. لكن هذا يعقّد. الحل الأبسط:

**إضافة migration صغيرة تُنشئ دالة اختبار `_test_update_reminder_with_reason(appt_id, kind, val, reason)` تكون:**
- `SECURITY INVOKER` (تحترم صلاحيات المستدعي)
- تُنفّذ `set_config('app.change_reason', _reason, true)` ثم `UPDATE`
- متاحة للموظّفين فقط

لكن هذا يوسّع سطح الـ API لغرض الاختبار فقط.

**البديل النهائي المعتمد:** الاختبارات تستدعي SQL خام عبر `psql` (متاح في exec لأن `PGHOST` مُعيّن حسب سياسات الـ workspace). في السكربت، نستدعي `child_process.execSync('psql -c "..."')` لتنفيذ:
```sql
BEGIN;
SET LOCAL app.change_reason = 'تعديل من الاستقبال';
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<reception-uid>", ...}';
UPDATE appointments SET reminder_2h = false WHERE id = '<id>';
COMMIT;
```
لكن `psql` يتجاوز RLS بصلاحية `postgres`. يمكن ضبط `SET ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)` لمحاكاة `auth.uid()`.

هذا معقّد وهشّ.

## النهج المُعتمد المُبسّط

الاختبار يُغطّي ما يمكن التحقّق منه عبر الـ API الحقيقي دون migration ولا psql:

**الاختبار 1: self_service عبر RPC `update_reminders_by_ref`**
- إنشاء موعد بواسطة admin.
- anon يستدعي `rpc('update_reminders_by_ref', { _ref, _phone, _reminder_24h: false, _reminder_2h: null })`.
- التحقّق من صف audit جديد: `source='self_service'`, `changed_by IS NULL`, `reminder_kind='reminder_24h'`, `old_value=true`, `new_value=false`, `reason IS NULL`.

**الاختبار 2: staff عبر UPDATE مباشر بلا reason**
- reception يسجّل دخول، يُحدّث `appointments.reminder_2h = false` عبر `.from('appointments').update(...)`.
- التحقّق: `source='staff'`, `changed_by=<receptionUid>`, `reason IS NULL`.

**الاختبار 3: admin عبر UPDATE مباشر**
- admin يسجّل دخول، يُحدّث `reminder_24h`.
- التحقّق: `source='staff'`, `changed_by=<adminUid>`.

**الاختبار 4: reason يُقرأ من `app.change_reason` — عبر service_role مع set_config**
- استخدام `admin.rpc('set_config', ...)` عبر دالة `pg_settings`؟ غير متاح.
- **البديل:** استدعاء migration موجودة تعيّن GUC ثم تُحدّث. الدالة الأنسب: `update_appointment_status(id, 'confirmed', 'reason X')` — لكنها لا تُغيّر reminders.
- **الحل:** استدعاء `admin.rpc('reschedule_appointment_by_ref', { _reason: 'Y', ...})` — لكن هذا يُغيّر التاريخ لا التذكيرات، ولا يُنشئ صف reminder_audit.

**قرار نهائي للاختبار 4:** إسقاطه، أو تحويله لاختبار مباشر عبر SQL exec.

## اختصار الخطة الفعلية

**تشغيل:** `bun tests/rls/reminder-preference-audit-trigger.test.ts`

**3 اختبارات فقط (بدون migration، بدون psql):**

1. `self_service via update_reminders_by_ref → source='self_service', changed_by NULL`
2. `staff (reception) direct UPDATE → source='staff', changed_by=<uid>`  
3. `admin direct UPDATE → source='staff', changed_by=<uid>`

**اختبار reason من `app.change_reason`:** يتطلّب مسار SQL خام. إن أردت تغطيته:
- **الخيار أ:** إضافة migration بدالة اختبار مؤقّتة `_test_set_reminder_with_reason(...)` (سطح API إضافي).
- **الخيار ب:** استخدام `psql` عبر `execSync` داخل الاختبار (يعتمد على `PGHOST`).
- **الخيار ج:** الاكتفاء بالتحقّق أن `reason IS NULL` في السيناريوهات الحالية (تغطية سلبية فقط).

## سؤال قبل التنفيذ

ما التغطية المطلوبة لاختبار قراءة `reason` من `app.change_reason`؟

- (أ) إضافة migration بدالة SECURITY DEFINER محدودة (`admin`/`reception` فقط) تعيّن GUC ثم تُحدّث.
- (ب) استخدام `psql` مباشرة من داخل الاختبار.
- (ج) اقتصار الاختبارات على `source` و `changed_by` (بدون تغطية `reason` الإيجابية).