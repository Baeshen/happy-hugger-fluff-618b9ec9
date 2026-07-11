import { SITE } from "@/lib/site";

export function WhatsAppFab() {
  const href = `https://wa.me/${SITE.whatsapp}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="واتساب"
      className="fixed bottom-24 end-4 md:end-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 hover:scale-105 active:scale-95 transition"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor" aria-hidden>
        <path d="M19.11 17.36c-.31-.16-1.83-.9-2.11-1s-.49-.16-.69.16-.79 1-.97 1.21-.36.23-.67.08a8.6 8.6 0 0 1-2.53-1.56 9.5 9.5 0 0 1-1.75-2.18c-.18-.31 0-.48.14-.63.14-.14.31-.36.46-.54s.2-.31.31-.51.05-.39-.03-.54c-.08-.16-.69-1.66-.95-2.28-.25-.6-.5-.51-.69-.52h-.59a1.14 1.14 0 0 0-.83.39 3.48 3.48 0 0 0-1.09 2.59 6 6 0 0 0 1.27 3.2 13.79 13.79 0 0 0 5.29 4.68c.74.32 1.32.5 1.77.65a4.28 4.28 0 0 0 1.96.12 3.21 3.21 0 0 0 2.1-1.48 2.6 2.6 0 0 0 .18-1.48c-.07-.13-.28-.21-.59-.36zM16.07 5.33A10.55 10.55 0 0 0 5.55 15.83a10.4 10.4 0 0 0 1.5 5.36l-1.6 5.85 6-1.57a10.53 10.53 0 0 0 5 1.27h.02a10.55 10.55 0 0 0 5.6-19.41zM22.28 22a8.75 8.75 0 0 1-4.46 1.22 8.72 8.72 0 0 1-4.44-1.21l-.32-.19-3.55.93.95-3.46-.21-.34a8.68 8.68 0 0 1 13.5-10.53 8.7 8.7 0 0 1-1.47 13.58z" />
      </svg>
    </a>
  );
}
