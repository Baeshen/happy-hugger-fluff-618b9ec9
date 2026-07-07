
## الهدف
إظهار تاريخ تغيّر تفضيلات التذكير لكل حجز (قبل 24 ساعة / قبل ساعتين) مع القيمة السابقة والجديدة، وقت التعديل، ومصدره (المراجع نفسه أو موظف)، داخل شاشة تفاصيل الحجز في:
1. لوحة الإدارة (`/_authenticated/admin` → قائمة المواعيد → زر "السجل").
2. صفحة "حجوزاتي" `/_authenticated/my`.
3. صفحة البحث عن الحجز `/lookup` (المراجع بدون تسجيل دخول).

## التغييرات

### 1) خلفية — دالتان جديدتان (SECURITY DEFINER) في migration
تتيح للمراجع/المستخدم قراءة سجل تفضيلاته دون فتح `reminder_preference_audit` للجميع.

- `list_reminder_preferences_by_ref(_ref text, _phone text)` — تُرجع صفوف السجل لحجز يطابق ref+phone (نفس نمط `lookup_appointment`). تُستخدم في `/lookup`.
- `my_reminder_preference_audit(_appointment_id uuid)` — تتحقق أن الحجز يخص هاتف الـ `profile` الخاص بـ `auth.uid()` (نفس نمط `my_appointments`) ثم تُرجع سطور السجل. تُستخدم في `/my`.

كلاهما يُرجع: `id, reminder_kind, old_value, new_value, source, changed_at` (بدون `changed_by` لأنه لا يعني المراجع).

لوحة الإدارة تبقى على `listReminderPreferenceAudit` الموجودة (تدعم فلترة `appointmentId` أصلاً).

### 2) واجهة — لوحة الإدارة `src/routes/_authenticated/admin.tsx`
- توسعة `AuditModal` الحالي: إضافة قسم ثانٍ "سجل تفضيلات التذكير" تحت سجل الحالة/الملاحظات.
- استدعاء `listReminderPreferenceAudit({ appointmentId, pageSize: 100 })` بجانب `listAppointmentAudit`.
- عرض كل صف: نوع التذكير (قبل 24 ساعة/قبل ساعتين)، انتقال `old_value → new_value` (مفعّل/معطّل)، المصدر (staff/self_service/system)، الوقت، واسم المُنفّذ عند وجوده.
- رسالة فارغة عند غياب التغييرات.

### 3) واجهة — `/lookup`
- إضافة server function جديدة `getReminderPreferenceAuditByRef` في `src/lib/appointments.functions.ts` (أو الملف المناسب) تستدعي RPC `list_reminder_preferences_by_ref` بدون middleware.
- زر "سجل التذكيرات" داخل بطاقة الحجز يفتح موديل بسيط يعرض الصفوف بنفس التنسيق (بدون اسم مُنفّذ؛ يظهر "تعديل ذاتي" أو "موظف").

### 4) واجهة — `/my`
- server function `getMyReminderPreferenceAudit({ appointmentId })` بـ `requireSupabaseAuth` تستدعي RPC `my_reminder_preference_audit`.
- زر "سجل التذكيرات" داخل بطاقة كل حجز يفتح نفس الموديل المستخدم في `/lookup` (مكوّن مشترك في `src/components/`).

### 5) اختبارات
- اختبار RLS/RPC للتأكد أن `list_reminder_preferences_by_ref` لا تُرجع صفوفاً لحجز بهاتف مختلف، وأن `my_reminder_preference_audit` ترفض حجزاً لا يخص المستخدم الحالي.

## التفاصيل التقنية

### شكل صف السجل في الواجهة
```
قبل 24 ساعة: مفعّل → معطّل
٠٧/٠٧/٢٠٢٦ ١٠:٣٢ ص · تعديل ذاتي
```

### مكوّن مشترك
`ReminderPreferenceHistory` في `src/components/ReminderPreferenceHistory.tsx` يستقبل `rows` جاهزة، لتفادي تكرار الترجمة والتنسيق بين الشاشات الثلاث.

### الأدوار والصلاحيات
- admin/reception: عبر `listReminderPreferenceAudit` (موجودة).
- المستخدم المصادق: عبر RPC جديدة محدودة بهاتفه.
- المراجع anon: عبر RPC جديدة محدودة بـ ref+phone.
- لا تُمنح `SELECT` مباشرة على `reminder_preference_audit` لأي دور غير admin/reception.
