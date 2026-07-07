## الهدف
توسيع `tests/rls/reminder-preference-audit-rpcs.test.ts` بسيناريوهات تُثبت أن `my_reminder_preference_audit` تعزل المستخدمين تمامًا عند وجود عدة حجوزات لكل هاتف، ولا يحدث أي تداخل حتى عند تبديل هاتف الـ profile.

> ملاحظة: هذه الاختبارات نُفّذت فعليًا في الجولة السابقة ونجحت (20/20). هذه الخطة تُعيد تقديمها للاعتماد الرسمي في plan mode قبل أي تعديل لاحق.

## التغييرات
ملف واحد فقط: `tests/rls/reminder-preference-audit-rpcs.test.ts` — إضافة 5 اختبارات جديدة بعد اختبارات "authenticated user with NO profile phone".

### Seeding إضافي
- `ownerAppt2` لصاحب `ownerPhone` (يصبح لديه حجزان).
- `otherAppt2` لصاحب `otherPhone` (يصبح لديه حجزان).
- كل حجز يُنتج صف audit عبر تحديث `reminder_24h` (نفس نمط `seedAppt` الحالي).

### الاختبارات الخمسة
1. **owner sees each own appt** — حلقة على `[ownerAppt, ownerAppt2]`: كل استدعاء يُرجع ≥1 صف. يمنع الانحدار حيث تعمل الدالة لحجز واحد فقط للمالك.
2. **owner cannot read either of other's appts** — حلقة على `[otherAppt, otherAppt2]`: كل استدعاء يُرجع 0 صف.
3. **other cannot read either of owner's appts** — الاتجاه المعاكس، حلقة مماثلة.
4. **returned rows belong ONLY to requested appointment** — استدعاء `ownerAppt`، ثم مقارنة الـ ids المُعادة مع صفوف `admin.select` لنفس الحجز؛ التأكد أن أي صف من `ownerAppt2` (نفس المالك، حجز مختلف) لا يظهر. حارس ضد كون الفلترة بالهاتف فقط دون `_appointment_id`.
5. **profile phone swap re-scopes access dynamically** — تعديل `profiles.phone` لصاحب `ownerU` إلى `otherPhone`، ثم:
   - `otherAppt` يُصبح مقروءًا (يكسب صفوف الطرف الآخر) — يُثبت أن التطابق ديناميكي.
   - `ownerAppt` يُصبح 0 صف (يفقد الوصول القديم).
   - استعادة القيمة الأصلية في `finally` لتنظيف الحالة.

## التفاصيل التقنية
- كل الاختبارات تستخدم `ownerC`/`otherC` (جلسات موقّعة) المُنشأة أصلًا في نفس الملف.
- التنظيف: لا حاجة لإضافات — الحجوزات الجديدة تُدفع إلى `createdAppts` عبر `seedAppt`، ويتكفل `finally` الحالي بحذفها وحذف المستخدمين.
- التشغيل ضمن CI: يُلتقط تلقائيًا في وظيفة `rls-tests-pr` (glob على `tests/rls/*.test.ts`).
- زمن التشغيل: +حوالي 2 ثانية (استدعاءات RPC خفيفة على بيانات مُنشأة بالفعل).
