import Image from 'next/image';
import Navbar from '@/components/Navbar';
import { ArrowRight, Briefcase, MapPin, Users, Warehouse, ShieldCheck } from 'lucide-react';
import ParticlesBackground from '@/components/ParticlesBackground';
import { BRAND } from '@/lib/branding';
import Credit from '@/components/layout/Credit';

const AREAS = [
  { icon: Briefcase, label: 'Projects & tenders' },
  { icon: MapPin, label: 'Sites & progress' },
  { icon: Users, label: 'Workforce & attendance' },
  { icon: Warehouse, label: 'Warehouse & materials' },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto bg-[var(--md-bg)] text-[var(--md-on)]">
      <ParticlesBackground />

      {/* Ambient light */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-[120px] mix-blend-screen" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[100px] mix-blend-screen" />
      <div className="pointer-events-none absolute right-1/4 top-0 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[100px] mix-blend-screen" />

      <div className="relative z-20">
        <Navbar />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-4 py-16">
        {/* Logo */}
        <div className="group relative cursor-default transition-transform duration-700 hover:scale-[1.03]" style={{ perspective: '1200px' }}>
          <div className="absolute inset-0 scale-95 rounded-2xl bg-indigo-500/20 opacity-0 blur-xl transition-all duration-700 group-hover:scale-110 group-hover:opacity-100" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md transition-all duration-700 ease-out group-hover:[transform:rotateX(8deg)_rotateY(-8deg)] group-hover:shadow-[0_40px_80px_-20px_rgba(99,102,241,0.4)]">
            <Image
              src={BRAND.logo}
              alt={`${BRAND.company} logo`}
              width={360}
              height={360}
              className="w-[180px] rounded-xl object-contain sm:w-[260px] md:w-[320px]"
              priority
            />
          </div>
        </div>

        {/* Title */}
        <div className="max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300">
            {BRAND.company}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-[0.25em] sm:text-5xl md:text-6xl">
            {BRAND.product}
          </h1>
          <p className="mt-4 text-base text-slate-300 sm:text-lg">
            {BRAND.tagline}
          </p>
        </div>

        {/* Coverage */}
        <ul className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {AREAS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-slate-200 backdrop-blur-sm"
            >
              <Icon className="h-4 w-4 shrink-0 text-indigo-300" />
              <span className="leading-snug">{label}</span>
            </li>
          ))}
        </ul>

        {/* Primary action */}
        <div className="group relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 opacity-25 blur transition duration-500 group-hover:opacity-75 group-hover:duration-200" />
          <a
            href="/login"
            className="relative flex items-center gap-3 rounded-full border border-white/10 bg-[#5c6bc0] px-9 py-3.5 text-base font-semibold text-white shadow-xl transition-all duration-300 hover:scale-[1.02] hover:bg-[#4f5ea8] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className="tracking-wide">Sign in to {BRAND.product}</span>
            <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </div>

        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          {BRAND.accessNotice}
        </p>
        <Credit className="mt-2" />
      </div>
    </main>
  );
}
