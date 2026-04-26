import Nav from "@/components/Nav";
import TrackerSection from "@/components/TrackerSection";
import Footer from "@/components/Footer";

export default function TrackerPage() {
  return (
    <div id="page-scroll" style={{ minHeight: "100dvh", overflowX: "hidden", background: "var(--navy)" }}>
      <Nav activeSection="tracker" dark />
      <TrackerSection />
      <Footer />
    </div>
  );
}
