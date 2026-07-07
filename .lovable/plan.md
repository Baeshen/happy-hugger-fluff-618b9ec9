
## الهدف
شاشة موحّدة `/audit-export` (داخل `_authenticated`) لتصدير أربعة سجلات زمنية إلى CSV مع فلاتر: النطاق التاريخي، الفرع، الفاعل، ونوع الحدث/الحالة.

## السجلات المدعومة
1. **appointment_audit** — تدقيق المواعيد (تغييرات الحالة/الملاحظات + السبب + الفاعل).
2. **security_audit_log** — أحداث الأمان (login/role/table changes).
3. **reminder_preference_audit** — تفعيل/إيقاف التذكيرات (24س / 2س).
4. **dashboard_recent_activity** — آخر تغييرات المواعيد (مبني على audit + join مع appointments).

## البنية
- **Server Fn جديد**: `src/lib/audit-export.functions.ts` مع `requireSupabaseAuth` + فحص `has_role(admin|super_admin|reception)` داخل الـ handler.
  - يستقبل: `{ kind, from, to, branchId?, actorId?, statusOrEvent? }`.
  - يبني الاستعلام حسب `kind`:
    - `appointment_audit`: JOIN مع `appointments` لجلب اسم المريض/الهاتف/الفرع + فلترة branch/actor/new_status.
    - `security_audit_log`: SELECT مباشر مع فلترة actor/action.
    - `reminder_preference_audit`: JOIN مع `appointments` للحصول على branch + فلترة reminder_kind/source.
    - `dashboard_recent_activity`: استدعاء RPC الموجود `dashboard_recent_activity`.
  - يحدّد سقف 10,000 صف لكل تصدير لتجنب الحمل الزائد.
  - يعيد `{ rows: Record<string,unknown>[], columns: string[] }` — التحويل إلى CSV يتم في العميل.

- **الشاشة**: `src/routes/_authenticated/audit-export.tsx`
  - `Tabs` بأربع تبويبات (سجل واحد لكل تبويب).
  - نموذج فلاتر مشترك: DateRangePicker (افتراضي 30 يوم)، Select للفرع (يستخدم `list_public_branches_for_rating` أو fetch مباشر من `branches`)، Combobox للفاعل (اختياري — يستخدم `list_users_with_roles`)، Select لنوع الحدث (خيارات ديناميكية حسب التبويب).
  - جدول معاينة (أول 100 صف) قبل التصدير.
  - زر «تصدير CSV» يبني الملف ويحمّله عبر Blob (`text/csv;charset=utf-8` مع BOM لدعم Excel Arabic).

- **مكوّن مساعد**: `src/lib/csv.ts` — دالة `toCsv(rows, columns)` مع escape للفواصل/علامات التنصيص/الأسطر الجديدة + BOM.

- **الوصول من القائمة**: إضافة رابط «تصدير السجلات» في صفحة `admin.tsx` أو داخل قائمة More.

## أعمدة CSV لكل سجل
- **appointment_audit**: التاريخ، اسم المريض، الهاتف، الحالة السابقة، الحالة الجديدة، الملاحظات القديمة/الجديدة، السبب، الفاعل.
- **security_audit_log**: التاريخ، الإجراء، الفاعل، الجدول، معرف السجل، الفرع، IP، User Agent، البيانات الوصفية (JSON مختصر).
- **reminder_preference_audit**: التاريخ، اسم المريض، الهاتف، نوع التذكير، القيمة القديمة/الجديدة، المصدر، السبب، الفاعل.
- **dashboard_recent_activity**: التاريخ، اسم المريض، الحالة السابقة/الجديدة، السبب.

## الأمان
- كل الاستعلامات تمر عبر server fn محمي (`requireSupabaseAuth` + فحص دور staff).
- لا تعديل على RLS أو DB migrations.
- سجل قائم `security_audit_log`: قيد الفاعل التلقائي يبقى (لا حاجة لتغييره).

## الملفات
**جديدة**:
- `src/lib/audit-export.functions.ts`
- `src/lib/csv.ts`
- `src/routes/_authenticated/audit-export.tsx`

**تعديلات طفيفة**:
- إضافة رابط تنقل في `admin.tsx` (سطر واحد).

بدون تغييرات على قاعدة البيانات أو RLS.
