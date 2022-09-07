import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as fs from "fs";

const appLabels = { app: "prometheus" };

// Create a ClusterRole
const clusterRole = new k8s.rbac.v1.ClusterRole("prometheus", {
    metadata: { name: "prometheus" },
    rules: [
        {
            apiGroups: [""],
            resources: ["nodes", "nodes/proxy", "services", "endpoints", "pods"],
            verbs: ["get", "list", "watch"],
        },
        {
            apiGroups: ["extensions"],
            resources: ["ingresses"],
            verbs: ["get", "list", "watch"],
        },
        {
            nonResourceURLs: ["/metrics"],
            verbs: ["get"],
        },
    ],
});

// Create a ClusterRoleBinding
const clusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding("prometheus", {
    metadata: { name: "prometheus" },
    roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: clusterRole.metadata.name,
    },
    subjects: [
        {
            kind: "ServiceAccount",
            name: "default",
            namespace: "monitoring",
        },
    ],
});

// Create a ConfigMap
const configMap = new k8s.core.v1.ConfigMap("prometheus-server-conf", {
    metadata: {
        name: "prometheus-server-conf",
        namespace: "monitoring",
        labels: appLabels,
    },
    data: {
        "prometheus.rules": fs.readFileSync("prometheus.rules").toString(),
        "prometheus.yml": fs.readFileSync("prometheus.yml").toString(),
    },
});


// Create a Deployment
const deployment = new k8s.apps.v1.Deployment("prometheus-deployment", {
    metadata: {
        name: "prometheus-deployment",
        namespace: "monitoring",
        labels: appLabels,
    },
    spec: {
        replicas: 1,
        selector: { matchLabels: appLabels },
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [
                    {
                        name: "prometheus",
                        image: "prom/prometheus",
                        args: [
                            "--config.file=/etc/prometheus/prometheus.yml",
                            "--storage.tsdb.path=/prometheus/",
                        ],
                        ports: [{ containerPort: 9090 }],
                        volumeMounts: [
                            {
                                name: "prometheus-config-volume",
                                mountPath: "/etc/prometheus/",
                            },
                            {
                                name: "prometheus-storage-volume",
                                mountPath: "/prometheus/",
                            },
                        ],
                    },
                ],
                volumes: [
                    {
                        name: "prometheus-config-volume",
                        configMap: {
                            defaultMode: 420,
                            name: configMap.metadata.name,
                        },
                    },
                    {
                        name: "prometheus-storage-volume",
                        emptyDir: {},
                    },
                ],
            },
        },
    },
});

// Create a Service
const service = new k8s.core.v1.Service("prometheus-service", {
    metadata: {
        name: "prometheus-service",
        namespace: "monitoring",
        labels: appLabels,
        annotations: {
            "prometheus.io/scrape": "true",
            "prometheus.io/port": "9090",
        },
    },
    spec: {
        type: "NodePort",
        selector: appLabels,
        ports: [
            {
                port: 8081,
                targetPort: 9090,
                nodePort: 30001,
            },
        ],
    },
});


export const name = deployment.metadata.name;
