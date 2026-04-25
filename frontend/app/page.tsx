"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import AnalyzeSection from "@/components/AnalyzeSection";
import TrackerSection from "@/components/TrackerSection";
import RoutinesSection from "@/components/RoutinesSection";
import Footer from "@/components/Footer";

type AppSection = "analyze" | "tracker" | "routines";

export default function Home() {
  const [activeSection, setActiveSection] = useState<AppSection>("analyze");

  return (
    <div id="page-scroll" style={{ minHeight: "100dvh", overflowX: "hidden" }}>
      <Nav
        activeSection={activeSection}
        onNavigate={(section) => setActiveSection(section as AppSection)}
      />
      <Hero onAnalyzeClick={() => setActiveSection("analyze")} />
      {activeSection === "analyze" && <AnalyzeSection />}
      {activeSection === "tracker" && <TrackerSection />}
      {activeSection === "routines" && <RoutinesSection />}
      <Footer />
    </div>
  );
}
