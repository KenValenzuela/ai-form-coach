import requests
import streamlit as st

API_BASE = "http://127.0.0.1:8000"

st.title("AI Weightlifting Form Coach MVP")

exercise = st.selectbox("Exercise", ["squat"])
camera_view = st.selectbox("Camera View", ["side"])
uploaded = st.file_uploader("Upload a squat video", type=["mp4", "mov", "avi", "mkv"])

if uploaded is not None:
    if st.button("Analyze"):
        files = {
            "video": (uploaded.name, uploaded.getvalue(), uploaded.type or "video/mp4")
        }
        data = {
            "exercise_type": exercise,
            "camera_view": camera_view,
        }

        with st.spinner("Analyzing video..."):
            resp = requests.post(f"{API_BASE}/api/analyze", data=data, files=files, timeout=120)

        if resp.ok:
            result = resp.json()
            st.success(f"Summary: {result['summary_status']}")
            st.write(f"Rep count: {result['rep_count']}")

            if result.get("overlay_image_url"):
                st.image(f"{API_BASE}{result['overlay_image_url']}", caption="Pose overlay preview")

            for rep in result["results"]:
                st.subheader(f"Rep {rep['rep_index']}")
                st.json(rep["metrics"])
                if rep.get("overlay_image_url"):
                    st.image(f"{API_BASE}{rep['overlay_image_url']}", caption=f"Rep {rep['rep_index']} overlay")
                if rep["issues"]:
                    for issue in rep["issues"]:
                        st.warning(f"{issue['label']}: {issue['feedback']}")
                else:
                    st.info("No major issues detected for this rep.")

            st.caption(result["disclaimer"])
        else:
            st.error(resp.text)
