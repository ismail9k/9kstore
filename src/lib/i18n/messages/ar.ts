import type { Messages } from "./en";

export const ar = {
  meta: { description: "9k Store — تصفح المنتجات واطلب على واتساب." },
  header: { switchLanguage: "تغيير اللغة" },
  price: { unit: "جنيه" },
  product: { soldOut: "نفدت الكمية", size: "المقاس", color: "اللون", price: "السعر",
             orderOnWhatsapp: "اطلب على واتساب" },
  notFound: { title: "الصفحة غير موجودة",
              body: "هذه الصفحة غير موجودة أو تم نقلها.",
              back: "الرجوع إلى المتجر" },
  home: { eyebrow: "إصدار جديد", headlineTop: "صُنع", headlineAccent: "لكل يوم.",
          viewProduct: "شاهد المنتج", empty: "لا توجد منتجات بعد — تابعونا على إنستجرام." },
  footer: { instagram: "إنستجرام", whatsapp: "واتساب" },
} satisfies Messages;
