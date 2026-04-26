import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import AnalyzeSection from "@/components/AnalyzeSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div id="page-scroll" style={{ minHeight: "100dvh", overflowX: "hidden" }}>
      <Nav activeSection="analyze" />
      <Hero />
      <AnalyzeSection />
      <Footer />
    </div>
  );
}
