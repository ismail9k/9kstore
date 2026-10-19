import type { Messages } from "./en";

export const ar = {
  meta: { description: "9k Store — تصفح المنتجات واطلب على واتساب." },
  header: { switchLanguage: "تغيير اللغة" },
  price: { unit: "جنيه" },
  product: { soldOut: "نفدت الكمية", size: "المقاس", color: "اللون", price: "السعر",
             orderOnWhatsapp: "اطلب على واتساب", chooseSize: "اختر المقاس أولاً",
             colorSoldOut: "هذا اللون نفدت كميته", sizeChart: "جدول المقاسات",
             orderingUnavailable: "الطلب غير متاح حاليًا" },
  notFound: { title: "الصفحة غير موجودة",
              body: "هذه الصفحة غير موجودة أو تم نقلها.",
              back: "الرجوع إلى المتجر" },
  unavailable: { title: "هذا المنتج لم يعد متاحًا",
                 body: "لم يعد في المتجر. شاهد المنتجات المتاحة الآن.",
                 back: "شاهد المنتجات المتاحة" },
  home: { eyebrow: "إصدار جديد", headlineTop: "صُنع", headlineAccent: "لكل يوم.",
          viewProduct: "شاهد المنتج", empty: "لا توجد منتجات بعد — تابعونا على إنستجرام." },
  footer: { instagram: "إنستجرام", whatsapp: "واتساب" },
  order: { code: "الكود", soldOut: "نفد هذا المقاس للتو — اختر مقاسًا آخر.",
           changed: "تغيّر السعر — راجع السعر قبل الطلب.",
           failed: "حدث خطأ. حاول مرة أخرى." },
} satisfies Messages;
