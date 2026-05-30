
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# ======================================================
# DASHBOARD FUNCTION
# ======================================================

def dashboard2(df):

    st.set_page_config(
        page_title="Rafale Flight Intelligence",
        layout="wide"
    )

    # ======================================================
    # CUSTOM UI
    # ======================================================

    st.markdown("""
    <style>

    .stApp {
        background-color: #0a0a0a;
        color: white;
    }

    div[data-testid="metric-container"] {

        background-color: #151515;

        border: 1px solid #ff4b4b;

        padding: 15px;

        border-radius: 12px;
    }

    </style>
    """, unsafe_allow_html=True)

    # ======================================================
    # HEADER
    # ======================================================

    st.title("✈ RAFALE FLIGHT INTELLIGENCE")

    st.subheader(
        "Advanced Mission Analytics Dashboard"
    )

    st.markdown("---")

    # ======================================================
    # METRICS
    # ======================================================

    total_records = len(df)

    avg_speed = round(
        df["ground_speed"].mean(), 2
    )

    max_speed = round(
        df["ground_speed"].max(), 2
    )

    avg_altitude = round(
        df["gps_altitude"].mean(), 2
    )

    max_altitude = round(
        df["gps_altitude"].max(), 2
    )

    avg_mach = round(
        df["mach_number"].mean(), 2
    )

    avg_vertical_speed = round(
        df["vertical_speed"].mean(), 2
    )

    # ======================================================
    # TOP METRICS
    # ======================================================

    c1, c2, c3, c4, c5, c6, c7 = st.columns(7)

    c1.metric(
        "TOTAL RECORDS",
        total_records
    )

    c2.metric(
        "AVG SPEED",
        f"{avg_speed} knots"
    )

    c3.metric(
        "MAX SPEED",
        f"{max_speed} knots"
    )

    c4.metric(
        "AVG ALTITUDE",
        f"{avg_altitude} ft"
    )

    c5.metric(
        "MAX ALTITUDE",
        f"{max_altitude} ft"
    )

    c6.metric(
        "AVG MACH",
        avg_mach
    )

    c7.metric(
        "AVG VERTICAL SPEED",
        avg_vertical_speed
    )

    st.markdown("---")

    # ======================================================
    # ROW 1
    # ======================================================

    left, middle, right = st.columns(3)

    # ======================================================
    # FLIGHT PHASE PIE CHART
    # ======================================================

    with left:

        phase_counts = (
            df["flight_phase"]
            .value_counts()
            .reset_index()
        )

        phase_counts.columns = [
            "Phase",
            "Count"
        ]

        fig1 = px.pie(
            phase_counts,
            names="Phase",
            values="Count",
            hole=0.5,
            title="FLIGHT PHASE DISTRIBUTION"
        )

        fig1.update_layout(

            paper_bgcolor="#151515",
            plot_bgcolor="#151515",

            font_color="white"
        )

        st.plotly_chart(
            fig1,
            use_container_width=True
        )

    # ======================================================
    # ALTITUDE GRAPH
    # ======================================================

    with middle:

        fig2 = px.line(
            df,
            x="time_s",
            y="gps_altitude",
            title="GPS ALTITUDE VS TIME"
        )

        fig2.update_layout(

            paper_bgcolor="#151515",
            plot_bgcolor="#151515",

            font_color="white"
        )

        st.plotly_chart(
            fig2,
            use_container_width=True
        )

    # ======================================================
    # GROUND SPEED GRAPH
    # ======================================================

    with right:

        fig3 = px.line(
            df,
            x="time_s",
            y="ground_speed",
            title="GROUND SPEED VS TIME"
        )

        fig3.update_layout(

            paper_bgcolor="#151515",
            plot_bgcolor="#151515",

            font_color="white"
        )

        st.plotly_chart(
            fig3,
            use_container_width=True
        )

    # ======================================================
    # SECOND ROW
    # ======================================================

    left2, right2 = st.columns(2)

    # ======================================================
    # FUEL FLOW GRAPH
    # ======================================================

    with left2:

        fig4 = px.area(
            df,
            x="time_s",
            y="fuel_flow_total",
            title="FUEL FLOW ANALYSIS"
        )

        fig4.update_layout(

            paper_bgcolor="#151515",
            plot_bgcolor="#151515",

            font_color="white"
        )

        st.plotly_chart(
            fig4,
            use_container_width=True
        )

    # ======================================================
    # ENGINE RPM COMPARISON
    # ======================================================

    with right2:

        fig5 = go.Figure()

        fig5.add_trace(
            go.Scatter(
                x=df["time_s"],
                y=df["engine1_rpm"],
                mode="lines",
                name="ENGINE 1 RPM"
            )
        )

        fig5.add_trace(
            go.Scatter(
                x=df["time_s"],
                y=df["engine2_rpm"],
                mode="lines",
                name="ENGINE 2 RPM"
            )
        )

        fig5.update_layout(

            title="ENGINE RPM COMPARISON",

            paper_bgcolor="#151515",
            plot_bgcolor="#151515",

            font_color="white"
        )

        st.plotly_chart(
            fig5,
            use_container_width=True
        )

# ======================================================
# LOAD DATASET
# ======================================================

df = pd.read_csv(
    "data/rafale_fdr_200param_1.csv"
)

# ======================================================
# RUN DASHBOARD
# ======================================================

dashboard2(df)
