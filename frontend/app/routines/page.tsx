import Nav from "@/components/Nav";
import RoutinesSection from "@/components/RoutinesSection";
import Footer from "@/components/Footer";

export default function RoutinesPage() {
  return (
    <div id="page-scroll" style={{ minHeight: "100dvh", overflowX: "hidden" }}>
      <Nav activeSection="routines" />
      <RoutinesSection />
      <Footer />
    </div>
  );
}
