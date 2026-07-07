
## الهدف

إضافة واجهة UI في لوحة الإدارة تعرض سجل تدقيق تفضيلات التذكير (`reminder_preference_audit`) مع دعم الفلترة حسب `appointment_id` وترقيم الصفحات — تستخدم الدالة الموجودة `listReminderPreferenceAudit`.

## ما هو موجود بالفعل

- الدالة `listReminderPreferenceAudit` في `src/lib/admin.functions.ts` جاهزة، تدعم:
  - فلترة: `appointmentId`, `reminderKind`, `source`
  - ترقيم: `page`, `pageSize` (1..100)
  - تُرجع: `{ rows, total, page, pageSize }` مع إثراء `changed_by_name` من `profiles`
- RLS: قراءة للـ admin/reception فقط (مؤكد بـ 16 اختبار في `reminder-preference-audit-rls.test.ts`)
- صفحة `src/routes/_authenticated/admin.tsx` تحتوي نظام تبويبات `Tab` وعرض شرطي لكل قسم

## نطاق التغيير

### 1) توسيع نظام التبويبات في `admin.tsx`

- إضافة قيمة جديدة `"reminders-audit"` إلى نوع `Tab`
- إضافة عنصر في مصفوفة التبويبات (label: "سجل التذكيرات"، أيقونة `Bell` أو `History` من lucide، `show: canSeeAppts` — أي admin أو reception)
- إضافة render شرطي: `{tab === "reminders-audit" && canSeeAppts && <RemindersAuditTab />}`

### 2) مكوّن `RemindersAuditTab` (داخل نفس الملف على غرار التبويبات الأخرى)

**الحالة (URL search params أو `useState`؟):**
- الاتّساق مع بقية التبويبات: `useState` محلي (بقية التبويبات لا تستخدم search params)
- state: `appointmentId` (string اختياري), `reminderKind` (`""|"reminder_24h"|"reminder_2h"`), `source` (`""|"staff"|"self_service"|"system"`), `page` (رقم، افتراضي 1), `pageSize` (ثابت 50)

**الاستعلام:**
- `useQuery` مع `queryKey: ["reminders-audit", { appointmentId, reminderKind, source, page }]`
- `queryFn`: `listReminderPreferenceAudit({ data: { appointmentId: appointmentId || undefined, reminderKind: reminderKind || undefined, source: source || undefined, page, pageSize: 50 } })`
- `keepPreviousData: true` (تجربة أفضل عند تغيير الصفحة)

**واجهة العرض:**

```text
┌─ فلاتر (شريط علوي) ───────────────────────────────────────┐
│  [رقم الحجز/UUID الموعد]  [نوع التذكير ▾]  [المصدر ▾]      │
│  [تطبيق] [مسح]                                              │
└──────────────────────────────────────────────────────────┘

جدول:
┌──────────┬────────────┬──────────┬───────┬─────────┬────────────┬──────────┐
│ التاريخ  │ الموعد     │ التذكير  │ من→إلى│ المصدر  │ بواسطة     │ السبب    │
├──────────┼────────────┼──────────┼───────┼─────────┼────────────┼──────────┤
│ 2026-07..│ abcd1234.. │ 24 ساعة │ ✓ → ✗ │ الموقع  │ (المريض)   │ —        │
│ 2026-07..│ abcd1234.. │ ساعتان   │ ✗ → ✓ │ موظف    │ سارة أحمد  │ تعديل   │
└──────────┴────────────┴──────────┴───────┴─────────┴────────────┴──────────┘

ترقيم: [< السابق]  صفحة X من Y (إجمالي N)  [التالي >]
```

**تفاصيل العرض:**
- `changed_at`: تنسيق عربي `dd MMM yyyy — HH:mm` (استخدام `Intl.DateTimeFormat("ar-SA")`)
- `appointment_id`: عرض أول 8 أحرف (مطابق للـ ref)، نص قابل للنسخ عند النقر
- `reminder_kind`: `"reminder_24h"` → "قبل 24 ساعة"، `"reminder_2h"` → "قبل ساعتين"
- `old_value → new_value`: أيقونات ✓/✗ ملوّنة (`text-green-600` / `text-muted-foreground`)
- `source`: badge بألوان: `staff` (أزرق)، `self_service` (رمادي)، `system` (بنفسجي)؛ بالعربية: "موظف" / "الموقع" / "النظام"
- `changed_by_name`: يظهر عند وجود قيمة، وإلا "—" (للـ self_service)
- `reason`: نص مقتطع بـ `line-clamp-2` مع tooltip كامل

**فلتر رقم الحجز:**
- المستخدم يُدخل ref بـ 8 أحرف أو UUID كامل
- عند إدخال 8 أحرف: نستدعي endpoint مساعد لتحويله لـ UUID كامل، أو نطلب لصق UUID مباشرة
- **قرار بسيط:** الحقل يقبل UUID كامل فقط (validation عبر regex)؛ إذا أدخل المستخدم ref قصير، نعرض رسالة "الرجاء استخدام معرّف الموعد الكامل من صفحة تفاصيل الموعد"
- بديل مستقبلي: زر "استرجاع من رقم الحجز + الهاتف" (خارج نطاق هذا التغيير)

**ترقيم الصفحات:**
- زرَّان "السابق" / "التالي" معطَّلان عند الحد
- `totalPages = Math.ceil(total / pageSize)`
- عرض "صفحة X من Y (الإجمالي N)"
- عند تغيير أي فلتر: إعادة `page` إلى 1

**حالات فارغة / أخطاء:**
- تحميل: `<div>جاري التحميل...</div>`
- خطأ: `<div className="text-destructive">{error.message}</div>` (الرسائل معرَّبة عبر `humanizeSupabaseError`)
- لا نتائج: "لا توجد سجلات مطابقة للمعايير"

### 3) لا تغييرات على قاعدة البيانات أو الـ API

الدالة الموجودة كافية. لا migration، لا edits على `admin.functions.ts`.

## غير المتضمَّن (تركه لطلبات لاحقة)

- تصدير CSV
- فلتر نطاق تاريخ (`from`/`to`)
- فلتر `changed_by`
- ربط مباشر من صفحة تفاصيل الموعد إلى هذا التبويب مع تعبئة الفلتر تلقائياً
- استخدام URL search params بدل `useState` (يتطلب إعادة هيكلة نظام التبويبات كلياً)

## المخاطر

- **حجم الملف**: `admin.tsx` يبلغ 1582 سطراً؛ إضافة ~150 سطر تُبقيه ضمن الاحتمال لكنه يستحق تقسيماً مستقبلياً. لا تقسيم في هذا التغيير للاتّساق مع بقية التبويبات.
- **صياغة الفلاتر الفارغة**: التأكد من تمرير `undefined` وليس `""` للدالة (schema يرفض السلاسل الفارغة على `z.string().uuid()`).

## التحقق بعد التنفيذ

- تشغيل `bunx tsgo --noEmit` (صفر أخطاء)
- فتح `/admin` بحساب admin/reception → التحقق من ظهور التبويب وعمل الفلاتر والترقيم
- التحقق أن حساب `pharmacy` لا يرى التبويب

