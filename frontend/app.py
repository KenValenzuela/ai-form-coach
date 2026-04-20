import requests
import streamlit as st

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
            resp = requests.post("http://127.0.0.1:8000/api/analyze", data=data, files=files, timeout=120)

        if resp.ok:
            result = resp.json()
            st.success(f"Summary: {result['summary_status']}")
            st.write(f"Rep count: {result['rep_count']}")

            for rep in result["results"]:
                st.subheader(f"Rep {rep['rep_index']}")
                st.json(rep["metrics"])
                if rep["issues"]:
                    for issue in rep["issues"]:
                        st.warning(f"{issue['label']}: {issue['feedback']}")
                else:
                    st.info("No major issues detected for this rep.")

            st.caption(result["disclaimer"])
        else:
            st.error(resp.text)