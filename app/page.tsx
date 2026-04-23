import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import AnalyzeSection from "@/components/AnalyzeSection";
import TrackerSection from "@/components/TrackerSection";
import RoutinesSection from "@/components/RoutinesSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div
      id="page-scroll"
      style={{ height: "100dvh", overflowY: "auto", overflowX: "hidden" }}
    >
      <Nav />
      <Hero />
      <AnalyzeSection />
      <TrackerSection />
      <RoutinesSection />
      <Footer />
    </div>
  );
}
