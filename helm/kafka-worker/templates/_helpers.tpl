{{- define "kafka-worker.labels" -}}
app.kubernetes.io/managed-by: Helm
app.kubernetes.io/part-of: kafka-worker
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
