from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.drift_pipeline import run_drift_report


with DAG(
    dag_id="drift_report",
    start_date=datetime(2025, 1, 1),
    schedule="@daily",
    catchup=False,
) as dag:
    PythonOperator(
        task_id="run_drift_report",
        python_callable=run_drift_report,
    )
