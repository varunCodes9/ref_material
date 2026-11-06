# 🛍️ ShopWave — Complete Kubernetes Tutorial
## Phase 1 se Phase 6 tak — Hinglish mein, Ek File mein Sab Kuch
### "Padho ek baar, yaad rahe zindagi bhar"

---

> **Yeh tutorial kaise use karein:**
> - Pehli baar: Poora padho, commands khud chalao
> - Revision ke waqt: Headings scan karo, concept yaad aa jaayega
> - Interview se pehle: Analogies aur diagrams dekho
> - Production incident mein: Command boxes seedha copy karo

---

# 🗺️ ShopWave Architecture — Bade picture se shuru

```
                         INTERNET
                            │
                    ┌───────▼────────┐
                    │  Ingress Nginx  │  ← Phase 4: Bahar se andar ka darwaza
                    │  api.shopwave   │    HTTPS, TLS, Rate Limit
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │  API Gateway   │  ← Hamaara "Traffic Police"
                    │   Port 3000    │    JWT verify, route karo
                    └──┬──┬──┬──┬───┘
                       │  │  │  │
           ┌───────────┘  │  │  └──────────────┐
           ▼              ▼  ▼                  ▼
    ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐
    │  User    │  │  Product  │  │  Order   │  │Notification  │
    │ Service  │  │  Service  │  │  Service │  │  Service     │
    │ :3001    │  │  :3002    │  │  :3003   │  │  :3004       │
    └────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘
         │              │              │                │
    ┌────▼─────┐  ┌─────▼──────┐ ┌────▼─────┐    ┌────▼─────┐
    │Postgres  │  │Postgres +  │ │Postgres  │    │Postgres  │
    │(users DB)│  │Redis Cache │ │+ Kafka   │    │(notifs)  │
    └──────────┘  └────────────┘ └──────────┘    └──────────┘

Monitoring (Phase 6):
    Prometheus → Grafana Dashboard
    Loki → Log Aggregation
    AlertManager → PagerDuty/Slack
```

---

# 📦 PHASE 1: K8s Foundations
## "Pehle samjho K8s ka DNA"

---

## 1.1 Kubernetes Kya Hai? — Ek Real Analogy

**Bina Kubernetes:**
```
Tu ek restaurant ka owner hai.
Sab kaam manually:
  - Chef ne order mana kiya? Tu khud doosra dhundho.
  - Rush hour? Tu khud extra staff bulao.
  - Chef beemar? Tu khud khana pakao.
Thak jaoge. Scale nahi hoga.
```

**Kubernetes ke saath:**
```
Tu HR manager hai.
K8s = Restaurant Manager (khud sab handle karta hai):
  - Chef ne kaam choda? Manager turant replacement laata hai.
  - Rush hour? Manager khud extra staff hire karta hai.
  - Slow time? Unnecessary staff hata deta hai.
Tu sirf bolta hai: "Mujhe 3 chefs chahiye, dopahar tak."
Baaki K8s sambhalta hai.
```

**Technical definition:**
```
Kubernetes = Container Orchestration Platform

Iska kaam:
  1. Containers ko nodes pe schedule karna
  2. Failed containers restart karna
  3. Load balance karna
  4. Scale up/down karna
  5. Configuration aur secrets manage karna
  6. Rolling updates karna (zero downtime)
```

---

## 1.2 Cluster Architecture — Andar kya hai?

```
┌─────────────────────────────────────────────────────┐
│                  K8s CLUSTER                        │
│                                                     │
│  ┌─────────────────────────────────┐                │
│  │      CONTROL PLANE (Master)     │                │
│  │                                 │                │
│  │  ┌──────────────┐               │                │
│  │  │  API Server  │ ← Sab kuch    │                │
│  │  │  (kube-api)  │   yahan se    │                │
│  │  └──────┬───────┘   hota hai    │                │
│  │         │                       │                │
│  │  ┌──────▼───────┐ ┌──────────┐  │                │
│  │  │     etcd     │ │Scheduler │  │                │
│  │  │ (database)   │ │(placement│  │                │
│  │  │ sab state    │ │ decide)  │  │                │
│  │  └──────────────┘ └──────────┘  │                │
│  │  ┌────────────────────────────┐  │                │
│  │  │  Controller Manager        │  │                │
│  │  │  (Deployment, RS control)  │  │                │
│  │  └────────────────────────────┘  │                │
│  └─────────────────────────────────┘                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  WORKER NODE │  │  WORKER NODE │                 │
│  │              │  │              │                 │
│  │  ┌────────┐  │  │  ┌────────┐  │                 │
│  │  │kubelet │  │  │  │kubelet │  │                 │
│  │  └────────┘  │  │  └────────┘  │                 │
│  │  ┌────────┐  │  │  ┌────────┐  │                 │
│  │  │  Pod   │  │  │  │  Pod   │  │                 │
│  │  │  Pod   │  │  │  │  Pod   │  │                 │
│  │  └────────┘  │  │  └────────┘  │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

**Har component ka kaam:**
```
API Server   → Receptionist hai. Har request pehle yahan aati hai.
              kubectl koi bhi command chalao → API server pe jaati hai.

etcd         → Cluster ka "brain" / database.
              Saari state yahan store hoti hai (deployments, pods, secrets sab).
              etcd gone = cluster ko kuch yaad nahi.

Scheduler    → "Yeh pod kaunse node pe jaayega?" decide karta hai.
              Resources, affinity, taints dekh ke decide karta hai.

Controller   → "Desired state = Actual state?" ensure karta hai.
Manager        3 pods chahiye → 2 chal rahe hain → 1 aur banao!

kubelet      → Har worker node pe hota hai.
              "API server ne bola pod chalao" → kubelet container start karta hai.

kube-proxy   → Network rules maintain karta hai.
              Service ka traffic sahi pod tak kaise jaayega → yeh decide karta hai.
```

---

## 1.3 Namespace — Cluster ka "Flat System"

**Problem bina Namespace ke:**
```bash
kubectl get pods
# 500 pods dikhenge — dev, staging, prod sab mixed!
# "Yeh mera pod kaunsa hai?" — impossible!
# Galat pod delete kar diya — disaster!
```

**Analogy:**
```
Cluster = Mumbai city
Namespace = Alag alag areas (Bandra, Andheri, Dadar)

ShopWave ke namespaces:
  shopwave           → Hamaara production app
  shopwave-staging   → Testing environment
  shopwave-monitoring → Prometheus, Grafana (CCTV room)
  kube-system        → K8s ka apna room (KABHI mat chhedo!)
```

**ShopWave namespace YAML:**
```yaml
# k8s/phase-1-foundations/01-namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: shopwave
  labels:
    environment: production
    team: backend
    # Pod Security: is namespace mein koi pod root se nahi chalega
    pod-security.kubernetes.io/enforce: baseline
```

**Commands:**
```bash
# Namespace banao
kubectl apply -f k8s/phase-1-foundations/01-namespace.yaml

# Saare namespaces dekho
kubectl get namespaces

# Ek namespace ke saare resources
kubectl get all -n shopwave

# Default namespace set karo (baar baar -n shopwave mat likho)
kubectl config set-context --current --namespace=shopwave
```

---

## 1.4 Pod — K8s ka Sabse Chhota Unit

**Pod kya hai?**
```
Container  = Chef (actual kaam karta hai)
Pod        = Kitchen (chef ke saath utensils, shared space)

Ek pod mein ek ya zyada containers hote hain.
Same pod ke containers:
  - Same IP address share karte hain (localhost se baat karte hain)
  - Same volumes share kar sakte hain
  - Ek saath schedule hote hain (same node pe)
```

**Directly Pod banana (AVOID karo — sirf samajhne ke liye):**
```yaml
# Yeh kabhi production mein mat use karo!
# Sirf concept samajhne ke liye
apiVersion: v1
kind: Pod
metadata:
  name: product-service-pod
  namespace: shopwave
  labels:
    app: product-service
spec:
  containers:
  - name: product-service
    image: shopwave/product-service:1.0.0
    ports:
    - containerPort: 3002
```

```bash
# Pod directly banao
kubectl apply -f pod.yaml -n shopwave

# Pod dekho
kubectl get pods -n shopwave

# Pod delete karo
kubectl delete pod product-service-pod -n shopwave
# → Pod GONE. Koi wapas nahi laayega. Yahi problem hai!
# Isliye Deployment use karte hain.
```

---

## 1.5 ReplicaSet — "Hamesha N pods chalte rahein"

**ReplicaSet ka kaam:**
```
Tu bolta hai: "Mujhe hamesha 3 product-service pods chahiye"
ReplicaSet monitor karta hai:
  3 pods hain → OK, kuch mat karo
  1 pod crash → 2 bache → aur 1 banao (target 3 maintain karo)
  Manually 5 kiye → 3 chahiye → 2 hatao
```

**Note:** ReplicaSet directly use nahi karte — Deployment use karte hain jo RS manage karta hai.

```yaml
# Samajhne ke liye (directly use nahi karte)
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: product-service-rs
  namespace: shopwave
spec:
  replicas: 3      # Hamesha 3 pods
  selector:
    matchLabels:
      app: product-service   # In labels wale pods track karo
  template:        # Naye pods ka blueprint
    metadata:
      labels:
        app: product-service
    spec:
      containers:
      - name: product-service
        image: shopwave/product-service:1.0.0
```

---

## 1.6 Deployment — "Production mein yahi use karo"

**Deployment = ReplicaSet ka manager**
```
ReplicaSet  → Pods manage karta hai (count maintain)
Deployment  → ReplicaSets manage karta hai (updates, rollbacks)

Deployment ki superpowers:
  1. Rolling updates → Zero downtime se update karo
  2. Rollback       → Ek command se purana version wapas
  3. Pause/Resume   → Update rok sakte ho beech mein
  4. History        → Pichle 10 versions ka record
```

**ShopWave Product Service Deployment:**
```yaml
# k8s/phase-1-foundations/03-deployments.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
  namespace: shopwave
  labels:
    app.kubernetes.io/name: shopwave
    app.kubernetes.io/component: product-service

spec:
  replicas: 3    # Hamesha 3 pods

  # selector: Deployment batata hai "mujhe in pods pe nazar rakhni hai"
  # YEH template.metadata.labels se EXACTLY match karna chahiye
  selector:
    matchLabels:
      app: product-service

  # Rolling Update Strategy: Zero Downtime!
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Update ke time 1 EXTRA pod chal sakta hai (3+1=4 temporarily)
      maxUnavailable: 0  # Update ke time KONO pod band nahi hoga
      # maxSurge:1 + maxUnavailable:0 = Zero downtime guarantee

  # template: Har naye pod ka blueprint (yahi ReplicaSet use karta hai)
  template:
    metadata:
      labels:
        app: product-service   # ← MUST match selector.matchLabels
        version: "1.0.0"
      annotations:
        prometheus.io/scrape: "true"  # Prometheus ko batao metrics kahan hain
        prometheus.io/port: "3002"
        prometheus.io/path: "/metrics"

    spec:
      containers:
      - name: product-service
        image: shopwave/product-service:1.0.0
        imagePullPolicy: Always

        ports:
        - name: http        # Port ko naam diya — Service mein reference karenge
          containerPort: 3002

        # Resources: PRODUCTION MEIN ZAROORI HAI!
        # Bina resources ke ek pod puri node kha sakta hai
        resources:
          requests:          # "Minimum mujhe itna chahiye" — Scheduler isse dekh ke node choose karta hai
            memory: "128Mi"  # 128 MiB RAM
            cpu: "100m"      # 100 millicores = 0.1 CPU core
          limits:            # "Itne se ZYADA kabhi nahi lunga"
            memory: "512Mi"  # 512MB → exceed kiya → OOMKilled (restart)
            cpu: "500m"      # 0.5 core → exceed kiya → throttled (slow, nahi marega)

        # Probes: K8s ko batao pod healthy hai ya nahi
        livenessProbe:    # "Kya container zinda hai?" → Fail = RESTART
          httpGet:
            path: /health/live
            port: 3002
          initialDelaySeconds: 20   # Start hone ke baad 20 sec wait karo
          periodSeconds: 20         # Har 20 sec check karo
          failureThreshold: 3       # 3 baar fail → restart

        readinessProbe:   # "Kya container traffic le sakta hai?" → Fail = traffic band (restart nahi)
          httpGet:
            path: /health/ready
            port: 3002
          initialDelaySeconds: 10
          periodSeconds: 10
          failureThreshold: 3

        startupProbe:     # "Kya container start ho gaya?" → Fail = restart (liveness se pehle check)
          httpGet:
            path: /health/live
            port: 3002
          failureThreshold: 30    # 30 * 10s = 5 min startup time allow
          periodSeconds: 10

      terminationGracePeriodSeconds: 30  # Pod ko 30 sec milenge gracefully band hone ke liye
```

**Deployment Commands:**
```bash
# Deploy karo
kubectl apply -f k8s/phase-1-foundations/03-deployments.yaml

# Status dekho
kubectl get deployments -n shopwave
# NAME              READY   UP-TO-DATE   AVAILABLE   AGE
# product-service   3/3     3            3           5m

# Pods dekho
kubectl get pods -n shopwave -l app=product-service

# Rollout status (update ke time)
kubectl rollout status deployment/product-service -n shopwave

# Update karo (new image)
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:1.1.0 -n shopwave

# History dekho
kubectl rollout history deployment/product-service -n shopwave

# Rollback! (galti ho gayi)
kubectl rollout undo deployment/product-service -n shopwave

# Specific revision pe rollback
kubectl rollout undo deployment/product-service --to-revision=2 -n shopwave

# Restart karo (config change ke baad)
kubectl rollout restart deployment/product-service -n shopwave

# Pause/Resume (cautious update ke liye)
kubectl rollout pause deployment/product-service -n shopwave
kubectl rollout resume deployment/product-service -n shopwave
```

---

## 1.7 Service — "Stable Address for Pods"

**Problem bina Service ke:**
```
Pod ka IP hamesha badalta hai:
  Pod start: IP = 10.244.1.15
  Pod crash → restart: IP = 10.244.1.28  ← Naya IP!
  3 pods hain: 3 alag IPs

Order service ko product-service IP kaise pata chalega?
IP hardcode nahi kar sakte — hamesha badalta hai!
```

**Service ka solution:**
```
Service = Ek stable "virtual IP" aur DNS naam
Pod IPs badlein → Service IP same rehta hai
Service internally track karta hai kaunse pods available hain
Load balance bhi karta hai automatically!

DNS Magic:
  Same namespace:   product-service
  Cross namespace:  product-service.shopwave
  Full FQDN:       product-service.shopwave.svc.cluster.local
```

**Service Types:**
```
ClusterIP    → Sirf cluster ke andar (default) — hamaari internal services
NodePort     → Node ke IP + port se accessible — dev/testing
LoadBalancer → Cloud provider se external IP — production (expensive)
ExternalName → DNS CNAME — external service map karne ke liye
```

**ShopWave Services:**
```yaml
# k8s/phase-1-foundations/04-services.yaml
apiVersion: v1
kind: Service
metadata:
  name: product-service   # ← Yahi DNS naam banta hai
  namespace: shopwave

spec:
  type: ClusterIP          # Sirf cluster ke andar
  selector:
    app: product-service   # In labels wale pods ko traffic bhejo
                           # Selector = Service ka "targeting system"
  ports:
  - name: http
    port: 3002             # Service is port pe sunta hai
    targetPort: http       # Pod ke "http" named port pe forward karo (3002)
    protocol: TCP
```

**Service Commands:**
```bash
# Services dekho
kubectl get services -n shopwave

# Describe — endpoints dekho (real pod IPs)
kubectl describe service product-service -n shopwave
# Endpoints: 10.244.1.5:3002,10.244.1.6:3002,10.244.1.7:3002
# ↑ Yeh 3 pods ke IPs hain — Service automatically update karta hai

# Endpoints directly dekho
kubectl get endpoints product-service -n shopwave

# Local access ke liye port-forward
kubectl port-forward svc/product-service 3002:3002 -n shopwave
# Ab localhost:3002 → cluster ke product-service

# Service test karo (debug pod se)
kubectl run test-pod --image=curlimages/curl --rm -it -n shopwave -- \
  curl http://product-service:3002/api/products
```

---

## 1.8 Labels aur Selectors — "Sticky Notes System"

**Labels:**
```
Labels = Resources pe chipkaye hue sticky notes
Key: value pairs hote hain

Kisi bhi resource pe laga sakte ho:
  Pod, Deployment, Service, Node — sab pe

Fayda:
  Filter karo: kubectl get pods -l app=product-service
  Service target kare: selector: {app: product-service}
  HPA target kare: scaleTargetRef → labels
```

**ShopWave Label Convention:**
```yaml
labels:
  app.kubernetes.io/name: shopwave           # Project naam
  app.kubernetes.io/component: product-service  # Service naam
  app.kubernetes.io/version: "1.0.0"         # Version
  environment: production                    # Environment
  team: backend                              # Team
```

**Label Commands:**
```bash
# Labels ke saath pods dekho
kubectl get pods -n shopwave --show-labels

# Specific label filter
kubectl get pods -n shopwave -l app=product-service
kubectl get pods -n shopwave -l app=product-service,version=1.0.0

# Label add karo
kubectl label pod product-service-abc debug=true -n shopwave

# Label remove karo
kubectl label pod product-service-abc debug- -n shopwave  # ← minus = remove

# Node pe label lagao (node affinity ke liye)
kubectl label node shopwave-node-1 disk=ssd
```

---

# ⚙️ PHASE 2: Application Configuration
## "Separation of Concerns — Config aur Code Alag Rakho"

---

## 2.1 ConfigMap — "Non-sensitive Config ka Ghar"

**Problem bina ConfigMap:**
```
Option 1: Image mein hardcode karo
  ENV DB_HOST=prod-postgres.shopwave.internal
  Problem: Dev aur Prod ke liye alag images → double work

Option 2: Har environment ke liye alag Dockerfile
  Problem: Maintenance nightmare

ConfigMap solution:
  Same image → alag ConfigMap → alag environment
  Dev:  DB_HOST=localhost
  Prod: DB_HOST=postgres-service
  Image same, config alag → 12-factor app principle
```

**ShopWave ConfigMap:**
```yaml
# k8s/phase-2-config/01-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: shopwave-config
  namespace: shopwave

data:
  # Key: Value pairs — sab strings hain
  NODE_ENV: "production"
  LOG_LEVEL: "info"

  # Database (non-sensitive)
  DB_HOST: "postgres-service"   # K8s Service DNS naam
  DB_PORT: "5432"

  # Redis
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  CACHE_TTL_SECONDS: "300"

  # Kafka
  KAFKA_BROKERS: "kafka-service:9092"

  # Internal Service URLs (K8s DNS use karo)
  USER_SERVICE_URL: "http://user-service:3001"
  PRODUCT_SERVICE_URL: "http://product-service:3002"
  ORDER_SERVICE_URL: "http://order-service:3003"
```

**ConfigMap use karne ke 3 tarike:**

```yaml
# Tarika 1: envFrom — POORA ConfigMap inject karo
spec:
  containers:
  - name: product-service
    envFrom:
    - configMapRef:
        name: shopwave-config   # Sab keys env vars ban jaati hain

# Tarika 2: env.valueFrom — SPECIFIC key inject karo
    env:
    - name: DB_HOST_CUSTOM   # Environment variable ka naam
      valueFrom:
        configMapKeyRef:
          name: shopwave-config
          key: DB_HOST        # ConfigMap ki specific key

# Tarika 3: Volume mount — File ki tarah mount karo
    volumeMounts:
    - name: config-volume
      mountPath: /app/config   # Yahan files millengi
  volumes:
  - name: config-volume
    configMap:
      name: shopwave-config
      # /app/config/DB_HOST, /app/config/LOG_LEVEL files banengi
```

**ConfigMap Commands:**
```bash
# Apply karo
kubectl apply -f k8s/phase-2-config/01-configmap.yaml

# Dekho
kubectl get configmap -n shopwave
kubectl describe configmap shopwave-config -n shopwave

# Live update (bina redeploy ke — pod restart zaroori hoga values ke liye)
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p '{"data":{"LOG_LEVEL":"debug"}}'

# Phir rollout restart karo
kubectl rollout restart deployment/product-service -n shopwave

# BREAK IT exercise:
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p '{"data":{"DB_HOST":"wrong-host-xyz"}}'
kubectl rollout restart deployment/user-service -n shopwave
kubectl logs deployment/user-service -n shopwave | grep "ECONNREFUSED"
# Fix:
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p '{"data":{"DB_HOST":"postgres-service"}}'
kubectl rollout restart deployment/user-service -n shopwave
```

---

## 2.2 Secrets — "Sensitive Data ka Secure Locker"

**Secret vs ConfigMap:**
```
ConfigMap → Non-sensitive (DB_HOST, LOG_LEVEL, feature flags)
Secret    → Sensitive (DB_PASSWORD, JWT_SECRET, API keys)

Difference:
  Storage:    Secret etcd mein alag store hota hai
  Access:     RBAC se sirf authorized pods/users dekh sakte hain
  Display:    kubectl describe mein value nahi dikhti
  Base64:     Values encoded hain (NOT encrypted by default!)

CRITICAL WARNING:
  Base64 ≠ Encryption!
  echo "password123" | base64 → cGFzc3dvcmQxMjM=
  echo "cGFzc3dvcmQxMjM=" | base64 -d → password123
  Koi bhi decode kar sakta hai!

Production mein sahi approach:
  1. etcd encryption at rest enable karo (EncryptionConfiguration)
  2. External Secrets Operator + HashiCorp Vault / AWS Secrets Manager
  3. Sealed Secrets (GitOps ke liye)
  4. KABHI Secret YAML Git mein push mat karo!
```

**ShopWave Secrets:**
```yaml
# k8s/phase-2-config/02-secrets.yaml
# .gitignore mein add karo: k8s/phase-2-config/02-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: shopwave-secrets
  namespace: shopwave
type: Opaque   # Generic key-value secret

data:
  # echo -n "your-actual-value" | base64
  # -n flag important hai: newline nahi add karta
  JWT_SECRET: c2hvcHdhdmUtc3VwZXItc2VjcmV0
  JWT_REFRESH_SECRET: c2hvcHdhdmUtcmVmcmVzaA==
  REDIS_PASSWORD: U2hvcFdhdmVSZWRpcw==
---
apiVersion: v1
kind: Secret
metadata:
  name: shopwave-db-secret
  namespace: shopwave
type: Opaque
data:
  DB_USER: c2hvcHdhdmU=       # "shopwave"
  DB_PASSWORD: U2hvcFdhdmVEQg==   # "ShopWaveDB"
```

**Secret Deployment mein use karo:**
```yaml
spec:
  containers:
  - name: user-service
    env:
    - name: JWT_SECRET         # App mein process.env.JWT_SECRET
      valueFrom:
        secretKeyRef:
          name: shopwave-secrets
          key: JWT_SECRET
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: shopwave-db-secret
          key: DB_PASSWORD
```

**Secret Commands:**
```bash
# Best practice: YAML nahi, command se banao
kubectl create secret generic shopwave-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  --from-literal=REDIS_PASSWORD="ShopWave@Redis2024" \
  -n shopwave

# List dekho (values nahi dikhenge)
kubectl get secrets -n shopwave

# Base64 decode karke value dekho (caution!)
kubectl get secret shopwave-secrets -n shopwave \
  -o jsonpath='{.data.JWT_SECRET}' | base64 -d

# BREAK IT: Secret delete karo
kubectl delete secret shopwave-secrets -n shopwave
kubectl get pods -n shopwave  # Pods crash karenge!
kubectl describe pod <pod-name> -n shopwave | grep -A5 "Events"
# Warning: secret "shopwave-secrets" not found
# Fix: Secret wapas banao
```

---

## 2.3 Resource Requests aur Limits

**Analogy:**
```
Request = "Interview mein bola: mujhe 2 BHK chahiye"
Limit   = "Lease mein likha: 3 BHK se zyada nahi le sakte"

Kubernetes:
  Request → Scheduler isse dekh ke node choose karta hai
            "Is node pe 128Mi available hai? Theek hai, pod yahan jaayega"
  Limit   → Hard ceiling
            Memory limit exceed → OOMKilled (pod restart)
            CPU limit exceed    → Throttled (slow ho jaayega, restart nahi)
```

**CPU aur Memory units:**
```
CPU:
  1    = 1 core
  0.5  = half core
  500m = 500 millicores = half core (m = milli)
  100m = 0.1 core = 10% of one CPU

Memory:
  128Mi  = 128 Mebibytes (~134 MB)
  512Mi  = 512 Mebibytes (~537 MB)
  1Gi    = 1 Gibibyte (~1.07 GB)
  (Mi/Gi = binary, M/G = decimal — K8s mein Mi use karo)
```

**ShopWave Resource Matrix:**
```yaml
# API Gateway (traffic police — light work)
resources:
  requests: { memory: "128Mi", cpu: "100m" }
  limits:   { memory: "256Mi", cpu: "300m" }

# Product Service (DB queries + Redis — medium)
resources:
  requests: { memory: "128Mi", cpu: "100m" }
  limits:   { memory: "512Mi", cpu: "500m" }

# Order Service (Kafka + multiple API calls — heavy)
resources:
  requests: { memory: "256Mi", cpu: "200m" }
  limits:   { memory: "768Mi", cpu: "1000m" }

# PostgreSQL (database — memory hungry)
resources:
  requests: { memory: "256Mi", cpu: "250m" }
  limits:   { memory: "2Gi",   cpu: "2000m" }
```

**OOMKilled debug:**
```bash
# Pod crash detect karo
kubectl describe pod <pod-name> -n shopwave | grep -A5 "Last State"
# Last State: Terminated
#   Reason: OOMKilled    ← Yeh dikha → memory limit kam thi
#   Exit Code: 137       ← 137 = OOM ki pehchaan

# Memory usage dekho
kubectl top pods -n shopwave

# Fix: Limit badhaao
kubectl patch deployment order-service -n shopwave --type=json -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"1Gi"}
]'
```

---

# 💾 PHASE 3: Storage
## "Data ko Pod se Alag Rakho — Pods Marenge, Data Nahi"

---

## 3.1 Volume Types — Overview

```
emptyDir     → Temporary storage, pod ke saath create/delete
               Use: /tmp directory, cache, inter-container sharing
               Pod delete = data gone

hostPath     → Node ke filesystem pe store karo
               Risky: Pod doosre node pe gaya → data nahi milega
               Use: DaemonSets, system-level logging

PersistentVolume → External storage (EBS, GCS, NFS)
               Pod se independent — pod delete ho, data safe
               Use: Databases, user uploads

configMap/   → Config files volume ki tarah mount karo
secret         Already dekha humne
```

---

## 3.2 PV aur PVC — "Storage Request System"

**Analogy:**
```
Hotel rooms:
  PV  (PersistentVolume)      = Available hotel rooms
  PVC (PersistentVolumeClaim) = Room booking request
  StorageClass                = Hotel category (budget, luxury, premium)

Tu bolta hai (PVC): "Mujhe 10GB ka room chahiye, SSD type"
K8s dhundhta hai (PV): "Yeh 20GB ka SSD available hai — match!"
Bind hota hai: PVC ↔ PV
Pod use karta hai: volumeMount se PVC use karo
```

**PVC YAML:**
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data-pvc
  namespace: shopwave
spec:
  accessModes:
  - ReadWriteOnce    # Ek hi pod read-write kar sakta hai
                     # ReadWriteMany = multiple pods (NFS pe)
                     # ReadOnlyMany  = multiple pods readonly
  storageClassName: standard   # Minikube mein "standard"
                               # AWS EKS mein "gp3"
                               # GKE mein "standard"
  resources:
    requests:
      storage: 10Gi
```

**PVC Commands:**
```bash
# PVC status
kubectl get pvc -n shopwave
# NAME                STATUS   VOLUME         CAPACITY
# postgres-data-pvc   Bound    pvc-abc-123    10Gi       ← Bound = OK!
# redis-data-pvc      Pending  <none>         <none>     ← Pending = Problem!

# Pending troubleshoot
kubectl describe pvc redis-data-pvc -n shopwave
# Events:
# Warning: no persistent volumes available for this claim
# "storageclass.storage.k8s.io "gp3" not found"
# Fix: kubectl get storageclass → sahi class ka naam use karo
```

---

## 3.3 StatefulSet — "Database ka Sahib"

**Deployment vs StatefulSet:**
```
Deployment (stateless apps ke liye):
  Pod naam: product-service-abc123 (random)
  Restart: product-service-xyz789 (naya naam, naya volume!)
  Pods: interchangeable (koi bhi pod kisi bhi pod ki jagah le sakta hai)

StatefulSet (stateful apps ke liye):
  Pod naam: postgres-0 (predictable, numbered)
  Restart: postgres-0 (SAME naam, SAME volume!)
  Pods: ordered, each has unique identity

ShopWave mein StatefulSets:
  postgres-0     → Primary database
  redis-0        → Cache
  kafka-0        → Message broker
```

**ShopWave PostgreSQL StatefulSet:**
```yaml
# k8s/phase-3-storage/01-statefulsets.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: shopwave

spec:
  serviceName: "postgres-service"   # Headless service naam
  replicas: 1                        # Prod mein 3 (primary + 2 replicas)
  selector:
    matchLabels:
      app: postgres

  template:
    metadata:
      labels:
        app: postgres
    spec:
      securityContext:
        fsGroup: 999     # postgres user GID — files ko right permissions
      containers:
      - name: postgres
        image: postgres:16-alpine
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: shopwave-db-secret
              key: DB_USER
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: shopwave-db-secret
              key: DB_PASSWORD
        - name: PGDATA
          value: "/var/lib/postgresql/data/pgdata"
        resources:
          requests: { memory: "256Mi", cpu: "250m" }
          limits:   { memory: "2Gi",   cpu: "2000m" }
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        livenessProbe:
          exec:
            command: ["pg_isready", "-U", "shopwave"]
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command: ["pg_isready", "-U", "shopwave"]
          initialDelaySeconds: 5
          periodSeconds: 5

  # volumeClaimTemplates: Har pod ke liye automatically alag PVC
  # postgres-0 → postgres-data-postgres-0 PVC
  # postgres-1 → postgres-data-postgres-1 PVC (different pod, different volume!)
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: "standard"
      resources:
        requests:
          storage: 10Gi
---
# Headless Service (StatefulSet ke liye zaroori)
# clusterIP: None → virtual IP nahi, direct pod IPs
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
  namespace: shopwave
spec:
  clusterIP: None    # Headless!
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

**StatefulSet Magic — data loss test:**
```bash
# Data daalo
kubectl exec -it postgres-0 -n shopwave -- \
  psql -U shopwave -d shopwave_users \
  -c "INSERT INTO test_table (name) VALUES ('I survived pod restart!');"

# Pod forcefully delete karo!
kubectl delete pod postgres-0 -n shopwave

# Watch: Wapas aa raha hai SAME naam se
kubectl get pods -n shopwave -w
# postgres-0   Terminating → Pending → Running

# Data check karo — SAFE HAI!
kubectl exec -it postgres-0 -n shopwave -- \
  psql -U shopwave -d shopwave_users \
  -c "SELECT * FROM test_table;"
# "I survived pod restart!"  ← DATA SAFE!

# Deployment hota toh data gone hota!
```

---

## 3.4 StorageClass — "Storage ka Type"

```
StorageClass = Storage ka "menu card"

Minikube:
  standard → hostPath (local disk)

AWS EKS:
  gp2 → General Purpose SSD
  gp3 → Latest Gen SSD (faster, cheaper)
  io1 → Provisioned IOPS (high performance databases)

GKE:
  standard        → HDD
  standard-rwo    → SSD
  premium-rwo     → High performance SSD
```

```bash
# Available StorageClasses
kubectl get storageclass
# NAME                 PROVISIONER           RECLAIMPOLICY
# standard (default)   k8s.io/minikube-hostpath   Delete
# ↑ (default) = PVC mein storageClass specify na karo toh yeh use hogi

# Reclaim Policy:
# Delete → PVC delete = PV delete = DATA GONE (default in cloud)
# Retain → PVC delete = PV remains (data safe, manual cleanup)
# Production mein RETAIN use karo databases ke liye!
```

---

# 🌐 PHASE 4: Networking
## "Pods Ek Doosre Se Kaise Baat Karte Hain"

---

## 4.1 K8s Networking Model

```
K8s ka fundamental rule:
  "Har pod doosre har pod se baat kar sakta hai — NAT ke bina"

Matlab:
  product-service (pod IP: 10.244.1.5) →
  order-service   (pod IP: 10.244.2.8) →
  Direct communication, koi NAT nahi

Yeh CNI (Container Network Interface) plugin se hota hai:
  Calico, Flannel, Cilium, WeaveNet — yeh sab K8s mein networking dete hain
```

---

## 4.2 DNS in Kubernetes — "Service Discovery"

**K8s DNS automatically kaam karta hai:**
```
Service banao → Automatically DNS entry banti hai

ShopWave mein:
  product-service Service → DNS entries:

  1. product-service              ← Same namespace (shopwave namespace ke pods)
  2. product-service.shopwave     ← Namespace specify
  3. product-service.shopwave.svc ← .svc suffix
  4. product-service.shopwave.svc.cluster.local ← Full FQDN

Order service product-service ko call karta hai:
  axios.get('http://product-service:3002/api/products')
  ↓
  DNS resolution: product-service → 10.96.45.123 (Service ClusterIP)
  ↓
  Service → random pod select → response
```

**DNS Debug:**
```bash
# DNS test pod chalao
kubectl run dns-debug --image=busybox:1.28 --rm -it -n shopwave -- sh
# Pod ke andar:
nslookup product-service
# Server:    10.96.0.10     ← CoreDNS server
# Address 1: 10.96.45.123   ← Service ClusterIP

nslookup product-service.shopwave.svc.cluster.local
# Full FQDN bhi kaam karta hai

# CoreDNS pods check karo
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

---

## 4.3 Ingress — "Cluster ka Main Gate"

**Problem bina Ingress:**
```
5 services hain → 5 LoadBalancer Services → 5 external IPs → 5 × cost!
Har service ke liye alag domain → management nightmare

api.shopwave.com    → Gateway (one entry point)
api.shopwave.com    → Handle karo sab kuch ek jagah
```

**Ingress flow:**
```
User → api.shopwave.com → DNS → Load Balancer IP
     → Ingress Controller (nginx pod)
     → Rules check karo:
         /api/* → api-gateway Service → pods
     → Response wapas
```

**Ingress Setup:**
```bash
# STEP 1: Ingress Controller install karo
# Minikube:
minikube addons enable ingress

# Helm (production):
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

# STEP 2: Controller running hai?
kubectl get pods -n ingress-nginx
```

**ShopWave Ingress:**
```yaml
# k8s/phase-4-networking/01-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopwave-ingress
  namespace: shopwave
  annotations:
    kubernetes.io/ingress.class: "nginx"

    # HTTPS redirect
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # Rate limiting (DDoS protection)
    nginx.ingress.kubernetes.io/limit-rps: "50"

    # Request size limit
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"

    # Timeouts
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"

    # TLS certificate (cert-manager se automatic)
    cert-manager.io/cluster-issuer: "letsencrypt-prod"

spec:
  tls:
  - hosts:
    - api.shopwave.com
    secretName: shopwave-tls    # cert-manager yahan cert store karega

  rules:
  - host: api.shopwave.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-gateway   # Sab traffic gateway pe
            port:
              name: http
      - path: /health
        pathType: Exact
        backend:
          service:
            name: api-gateway
            port:
              name: http
```

**Ingress Commands:**
```bash
kubectl apply -f k8s/phase-4-networking/01-ingress.yaml

kubectl get ingress -n shopwave
# NAME               CLASS   HOSTS              ADDRESS         PORTS
# shopwave-ingress   nginx   api.shopwave.com   192.168.49.2    80, 443

# Local testing ke liye
echo "$(minikube ip) api.shopwave.com" | sudo tee -a /etc/hosts
curl http://api.shopwave.com/api/products

# TLS certificate status
kubectl get certificate -n shopwave
kubectl describe certificate shopwave-tls -n shopwave
```

---

## 4.4 NetworkPolicy — "Pod ka Firewall"

**Default K8s network (INSECURE):**
```
notification-service → postgres directly access kar sakta hai?
                        YES! (by default)
Hacker ne pod compromise kiya → Cluster mein saab pod accessible!
```

**NetworkPolicy philosophy:**
```
1. DEFAULT DENY ALL (pehle sab band karo)
2. Phir SPECIFIC connections whitelist karo

ShopWave mein:
  api-gateway     → user, product, order service (YES)
  user-service    → postgres, redis (YES)
  user-service    → kafka, notification-service (NO - zaroorat nahi)
  notification-service → postgres (YES - notification logs)
  notification-service → kafka (YES - events consume karne ke liye)
```

**ShopWave NetworkPolicies:**
```yaml
# k8s/phase-4-networking/02-networkpolicy.yaml

# STEP 1: Default deny ALL
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: shopwave
spec:
  podSelector: {}        # Saare pods pe apply
  policyTypes:
  - Ingress
  - Egress               # Dono directions band

---
# STEP 2: DNS allow (ZAROORI — bina is ke kuch kaam nahi karega)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: shopwave
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP

---
# STEP 3: Product service allow
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-product-service
  namespace: shopwave
spec:
  podSelector:
    matchLabels:
      app: product-service
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: api-gateway } }
    ports: [{ port: 3002 }]
  - from:
    - podSelector: { matchLabels: { app: order-service } }
    ports: [{ port: 3002 }]   # Order service stock update ke liye
  egress:
  - to:
    - podSelector: { matchLabels: { app: postgres } }
    ports: [{ port: 5432 }]
  - to:
    - podSelector: { matchLabels: { app: redis } }
    ports: [{ port: 6379 }]
```

**NetworkPolicy Test:**
```bash
kubectl apply -f k8s/phase-4-networking/02-networkpolicy.yaml

# Test 1: Allowed connection
kubectl exec -it deployment/order-service -n shopwave -- \
  wget -qO- --timeout=5 http://product-service:3002/health
# {"status":"ok"}  ← ALLOWED!

# Test 2: Blocked connection (user-service → order-service nahi hona chahiye)
kubectl exec -it deployment/user-service -n shopwave -- \
  wget -qO- --timeout=5 http://order-service:3003/health || echo "BLOCKED!"
# wget: download timed out  BLOCKED!  ← Sahi hai!
```

---

# 🔒 PHASE 5: Security
## "Principle of Least Privilege — Sirf Utna Jitna Zaroori"

---

## 5.1 RBAC — "Who Can Do What"

**Analogy:**
```
Hospital mein:
  Doctor    → Patient records dekh sakta hai, medicine prescribe kar sakta hai
  Nurse     → Medicine de sakta hai, records dekh sakta hai (delete nahi)
  Receptionist → Appointment book kar sakta hai, records nahi dekh sakta
  Janitor   → Koi medical access nahi

K8s RBAC:
  user-service pod  → Apne secrets get kar sakta hai (delete nahi)
  order-service pod → product-service call kar sakta hai
  monitoring pod    → Saare pods/metrics read kar sakta hai (write nahi)
  Default service account → KUCH NAHI (least privilege)
```

**RBAC ke 4 components:**
```
Role             → Permissions ka bundle (namespace-scoped)
ClusterRole      → Permissions ka bundle (cluster-wide)
RoleBinding      → Role ko kisi User/ServiceAccount se jodo (namespace)
ClusterRoleBinding → ClusterRole ko User/SA se jodo (cluster-wide)

Flow:
  Pod → ServiceAccount → RoleBinding → Role → Permissions
```

**ShopWave RBAC:**
```yaml
# k8s/phase-5-security/01-rbac.yaml

# 1. ServiceAccount (pod ki identity)
apiVersion: v1
kind: ServiceAccount
metadata:
  name: product-service-sa
  namespace: shopwave
automountServiceAccountToken: false   # Default token auto-mount band karo
---
# 2. Role (permissions)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: shopwave-app-role
  namespace: shopwave
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "watch"]      # Padhna only
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]               # Sirf get (list nahi — list se sab expose!)
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]       # Apne pod info dekhna
---
# 3. RoleBinding (SA + Role connect karo)
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: shopwave-app-binding
  namespace: shopwave
subjects:
- kind: ServiceAccount
  name: product-service-sa
  namespace: shopwave
roleRef:
  kind: Role
  name: shopwave-app-role
  apiGroup: rbac.authorization.k8s.io
```

**Deployment mein SA use karo:**
```yaml
spec:
  template:
    spec:
      serviceAccountName: product-service-sa   # Custom SA (default nahi!)
      automountServiceAccountToken: false
```

**RBAC Test Commands:**
```bash
kubectl apply -f k8s/phase-5-security/01-rbac.yaml

# Test: kya product-service-sa secrets get kar sakta hai?
kubectl auth can-i get secrets \
  --as=system:serviceaccount:shopwave:product-service-sa \
  -n shopwave
# yes ✓

# Test: kya delete kar sakta hai?
kubectl auth can-i delete secrets \
  --as=system:serviceaccount:shopwave:product-service-sa \
  -n shopwave
# no ✓  (least privilege!)

# Test: kya deployments dekh sakta hai?
kubectl auth can-i list deployments \
  --as=system:serviceaccount:shopwave:product-service-sa \
  -n shopwave
# no ✓  (zaroorat nahi hai)
```

---

## 5.2 Security Context — "Container ko Cage mein Rakho"

**Default container (DANGEROUS):**
```
Root user se chalta hai (UID 0)
Hacker ne pod compromise kiya → Root access!
Container mein likhne ki full freedom
All Linux capabilities enabled
```

**Security Context (SAFE):**
```
Non-root user se chale (UID 1001)
Root filesystem read-only
All Linux capabilities drop
Privilege escalation blocked
```

**ShopWave Secure Deployment:**
```yaml
spec:
  template:
    spec:
      # Pod-level security (saare containers pe apply)
      securityContext:
        runAsNonRoot: true      # Root (UID 0) BANNED
        runAsUser: 1001         # UID 1001 se chalega
        runAsGroup: 1001
        fsGroup: 1001           # Volume files ka GID
        seccompProfile:
          type: RuntimeDefault  # OS-level syscall filtering

      containers:
      - name: product-service
        # Container-level security (additional)
        securityContext:
          allowPrivilegeEscalation: false   # sudo ban
          readOnlyRootFilesystem: true      # Filesystem read-only
          capabilities:
            drop: ["ALL"]     # Saari Linux capabilities drop

        volumeMounts:
        - name: tmp             # readOnlyRootFilesystem ke saath /tmp zaroori
          mountPath: /tmp
        - name: logs
          mountPath: /app/logs

      volumes:
      - name: tmp
        emptyDir: {}
      - name: logs
        emptyDir:
          sizeLimit: 100Mi    # Log folder max 100MB
```

---

## 5.3 Secret Management — Production Best Practices

**Level 1 (AVOID): Plain Secret YAML in Git**
```yaml
# ❌ KABHI MAT KARO
# secrets.yaml → git push → GitHub pe visible!
data:
  DB_PASSWORD: cGFzc3dvcmQ=   # Anyone can decode!
```

**Level 2 (OK): kubectl create secret (command line)**
```bash
# ✅ YAML file nahi, command se banao
kubectl create secret generic shopwave-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  -n shopwave
# Sirf etcd mein store hoga, Git mein nahi jaayega
```

**Level 3 (GOOD): Sealed Secrets (GitOps ke liye)**
```bash
# kubeseal encrypt karta hai → encrypted YAML Git mein safe hai
kubeseal --format yaml < secrets.yaml > sealed-secrets.yaml
# sealed-secrets.yaml → Git mein push karo (safe!)
# Cluster mein controller decrypt karta hai
```

**Level 4 (BEST): External Secrets Operator + Vault**
```yaml
# ExternalSecret → Vault se automatically sync
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: shopwave-secrets
  namespace: shopwave
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: shopwave-secrets   # K8s Secret naam
  data:
  - secretKey: JWT_SECRET
    remoteRef:
      key: shopwave/production
      property: jwt_secret
  - secretKey: DB_PASSWORD
    remoteRef:
      key: shopwave/production
      property: db_password
# Vault se automatically JWT_SECRET aur DB_PASSWORD aayenge
# Rotate karo Vault mein → K8s Secret auto-update!
```

---

# 📊 PHASE 6: Production Operations
## "Dekho, Scale Karo, Deploy Karo — Production ki Real Life"

---

## 6.1 HPA — "Auto-Scaling (Mumbai Local Train System)"

**Analogy:**
```
Mumbai Local:
  Rush hour (9-10 AM):  12 bogies (zyada passengers)
  Normal time:           6 bogies (kam passengers)
  Raat:                  4 bogies (minimum)

HPA exactly yahi karta hai:
  CPU 90% (rush hour) → 10 pods
  CPU 40% (normal)    → 3 pods
  CPU 10% (raat)      → 2 pods (minimum)

Cost saving:
  Fixed 10 pods 24/7 → expensive
  HPA: raat ko 2 pods, din mein 8 → smart!
```

**HPA Kaise Kaam Karta Hai:**
```
Metrics Server → har 15 sec mein CPU/Memory data collect karta hai
HPA Controller → har 15 sec mein check karta hai:

Formula:
  desiredReplicas = ceil(currentReplicas × currentMetric / targetMetric)

Example:
  currentReplicas = 3
  currentCPU = 90%
  targetCPU = 60%
  desiredReplicas = ceil(3 × 90/60) = ceil(4.5) = 5 pods → scale up!

  currentReplicas = 5
  currentCPU = 20%
  targetCPU = 60%
  desiredReplicas = ceil(5 × 20/60) = ceil(1.67) = 2 pods → scale down (after cool down)
```

**ShopWave HPA:**
```yaml
# k8s/phase-6-operations/hpa.yaml
apiVersion: autoscaling/v2    # v2 = multiple metrics support
kind: HorizontalPodAutoscaler
metadata:
  name: product-service-hpa
  namespace: shopwave

spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: product-service

  minReplicas: 2    # Kabhi bhi 2 se kam nahi (zero-downtime)
  maxReplicas: 10   # Cost control — zyada nahi

  metrics:
  # Metric 1: CPU
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60   # 60% CPU pe scale up

  # Metric 2: Memory
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60    # 60 sec wait — temporary spike ke liye mat scale karo
      policies:
      - type: Pods
        value: 2                         # Ek baar mein max 2 pods add
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300   # 5 min wait before scale down (traffic wapas aa sakta)
      policies:
      - type: Pods
        value: 1                         # Ek baar mein sirf 1 pod hatao (gentle)
        periodSeconds: 120
```

**HPA Commands:**
```bash
# Metrics server zaroori hai!
minikube addons enable metrics-server

# HPA apply karo
kubectl apply -f k8s/phase-6-operations/hpa.yaml

# Status dekho
kubectl get hpa -n shopwave
# NAME                  TARGETS       MINPODS   MAXPODS   REPLICAS
# product-service-hpa   cpu: 15%/60%  2         10        2

# Live watch karo
kubectl get hpa -n shopwave -w

# Load test → HPA in action!
kubectl run load-gen --image=busybox --rm -it -n shopwave -- \
  sh -c "while true; do wget -qO- http://product-service:3002/api/products; done"

# Doosre terminal mein:
watch -n 5 kubectl get hpa -n shopwave
# Dekho CPU badhega → pods badhenge → load gen band karo → pods ghatenge
```

---

## 6.2 Monitoring — "Prometheus + Grafana"

**Monitoring Stack:**
```
Application Pod → /metrics endpoint → Prometheus scrape → Grafana display

Prometheus  = Data collector ("Sensor network")
Grafana     = Dashboard ("CCTV monitor room")
Alertmanager = Alert sender ("Security guard jo Slack pe message karta hai")

ShopWave metrics (prom-client se expose ho rahe hain):
  shopwave_gateway_requests_total          → Total requests
  shopwave_gateway_request_duration_seconds → Latency
  shopwave_product_cache_hits_total         → Cache hit rate
  shopwave_orders_created_total             → Orders per minute
  shopwave_user_registrations_total         → New users
```

**Install (Helm se — recommended):**
```bash
# Helm repo add karo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install karo
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n shopwave-monitoring \
  --create-namespace \
  --set grafana.adminPassword=shopwave123

# Wait karo
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=grafana \
  -n shopwave-monitoring --timeout=120s

# Access Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n shopwave-monitoring &
# Browser: http://localhost:3000
# Login: admin / shopwave123
```

**ServiceMonitor — Prometheus ko batao ShopWave kahan hai:**
```yaml
# k8s/phase-6-operations/monitoring.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: shopwave-monitor
  namespace: shopwave-monitoring
  labels:
    release: monitoring    # Prometheus Operator is label se dhundhta hai

spec:
  namespaceSelector:
    matchNames: [shopwave]   # shopwave namespace ke services monitor karo
  selector:
    matchLabels:
      app.kubernetes.io/name: shopwave
  endpoints:
  - port: http
    path: /metrics
    interval: 15s
```

**Alert Rules:**
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: shopwave-alerts
  namespace: shopwave-monitoring
  labels:
    release: monitoring

spec:
  groups:
  - name: shopwave.critical
    rules:

    # Alert 1: Service down
    - alert: ShopWaveServiceDown
      expr: up{namespace="shopwave"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Service DOWN: {{ $labels.job }}"
        description: "{{ $labels.pod }} 1 minute se down hai. TURANT DEKHO!"

    # Alert 2: High error rate
    - alert: HighErrorRate
      expr: |
        rate(shopwave_gateway_requests_total{status=~"5.."}[5m])
        / rate(shopwave_gateway_requests_total[5m]) > 0.05
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "Error rate 5% se zyada hai"
        description: "Error rate: {{ $value | humanizePercentage }}"

    # Alert 3: Pod crash looping
    - alert: PodCrashLooping
      expr: |
        rate(kube_pod_container_status_restarts_total{
          namespace="shopwave"}[15m]) * 60 * 15 > 3
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod crash loop: {{ $labels.pod }}"

    # Alert 4: High memory
    - alert: HighMemoryUsage
      expr: |
        container_memory_usage_bytes{namespace="shopwave"}
        / container_spec_memory_limit_bytes{namespace="shopwave"} > 0.85
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Memory 85% se zyada: {{ $labels.pod }}"

    # Alert 5: Certificate expiry
    - alert: CertificateExpiringSoon
      expr: certmanager_certificate_expiration_timestamp_seconds - time() < 30 * 24 * 3600
      for: 1h
      labels:
        severity: warning
      annotations:
        summary: "Certificate 30 din mein expire: {{ $labels.name }}"
```

---

## 6.3 Logging — "Loki Stack"

**Problem bina centralized logging:**
```
10 pods hain, sab ke alag logs.
kubectl logs product-service-abc   → pod 1 ke logs
kubectl logs product-service-def   → pod 2 ke logs
kubectl logs product-service-ghi   → pod 3 ke logs

Order ka trace karna hai? Tin jagah dhundho!
Pod restart hua → logs gone!
```

**Loki Stack:**
```
Promtail → Har node pe agent, logs collect karta hai
Loki     → Log storage aur indexing
Grafana  → Log search aur visualization (same Grafana jo metrics dekh raha hai)

Flow:
  Pod stdout/stderr
  → Promtail (node pe)
  → Loki (store + index)
  → Grafana (search: {namespace="shopwave"} |= "ERROR")
```

**Install:**
```bash
helm repo add grafana https://grafana.github.io/helm-charts

helm install loki grafana/loki-stack \
  -n shopwave-monitoring \
  --set promtail.enabled=true \
  --set grafana.enabled=false   # Grafana already install hai

# Grafana mein Loki datasource add karo:
# URL: http://loki:3100
```

**ShopWave mein structured logging (kyun zaroori hai):**
```javascript
// BAD: Random string logs
console.log("order failed for user 123 amount 500")
// Loki mein dhundhna impossible!

// GOOD: Structured JSON logs
logger.error('Order creation failed', {
  userId:   'user-123',
  orderId:  'order-456',
  amount:   500,
  reason:   'insufficient_stock',
  service:  'order-service',
  traceId:  req.headers['x-trace-id']
});
// Loki query: {namespace="shopwave"} | json | userId="user-123"
```

**Loki Queries (LogQL):**
```
# Saare shopwave errors
{namespace="shopwave"} |= "ERROR"

# Specific service ke logs
{namespace="shopwave", pod=~"product-service-.*"}

# JSON parse karke filter
{namespace="shopwave"} | json | level="error"

# Order failures
{namespace="shopwave"} | json | service="order-service" | level="error"

# Last 5 minutes mein errors count
count_over_time({namespace="shopwave"} |= "ERROR" [5m])
```

---

## 6.4 Release Strategies — "Safe Deployment"

### Rolling Update (Default)
```
Before: [v1] [v1] [v1] [v1]
Step 1: [v1] [v1] [v1] [v2]   ← 1 new pod
Step 2: [v1] [v1] [v2] [v2]   ← 2 new pods
Step 3: [v1] [v2] [v2] [v2]   ← 3 new pods
After:  [v2] [v2] [v2] [v2]   ← All updated

Zero downtime: Hamesha kuch pods available
Slow rollback: Undo karna padta hai
Default K8s strategy
```

```bash
# Rolling update
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:1.1.0 -n shopwave

# Watch karo
kubectl rollout status deployment/product-service -n shopwave

# Kuch gadbad? Rollback!
kubectl rollout undo deployment/product-service -n shopwave
```

### Blue-Green Deployment
```
Blue  = Current production (v1, 100% traffic)
Green = New version ready (v2, 0% traffic)

Test green thoroughly
Switch Service selector: blue → green (instant!)
Problem? Switch back instantly

Fayda: Instant rollback
Cost: Double infrastructure temporarily
```

```bash
# Green deploy karo (traffic nahi)
kubectl apply -f - << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service-green
  namespace: shopwave
spec:
  replicas: 3
  selector:
    matchLabels:
      app: product-service-green
  template:
    metadata:
      labels:
        app: product-service-green
    spec:
      containers:
      - name: product-service
        image: shopwave/product-service:2.0.0
        resources:
          requests: { memory: "128Mi", cpu: "100m" }
          limits: { memory: "512Mi", cpu: "500m" }
EOF

# Green ready hone ka wait karo
kubectl rollout status deployment/product-service-green -n shopwave

# Test green (port-forward se)
kubectl port-forward deployment/product-service-green 3099:3002 -n shopwave &
curl http://localhost:3099/health  # ← Test karo

# SWITCH! (ek command — zero downtime)
kubectl patch service product-service -n shopwave \
  -p '{"spec":{"selector":{"app":"product-service-green"}}}'

# Kuch gadbad? INSTANT ROLLBACK:
kubectl patch service product-service -n shopwave \
  -p '{"spec":{"selector":{"app":"product-service"}}}'

# Green OK hai? Blue hatao
kubectl delete deployment product-service -n shopwave
kubectl scale deployment product-service-green --replicas=3 -n shopwave
```

### Canary Deployment
```
90% traffic → v1 (stable)
10% traffic → v2 (canary)

Agar v2 mein errors → sirf 10% users affected
Monitor karo → errors nahi? Slowly 100% karo
Errors hain? Canary hatao — sirf 10% affected the

ShopWave mein:
  9 stable pods + 1 canary pod = 10% canary traffic
  (Service dono ko traffic bhejta hai — selector se)
```

```bash
# Canary deploy (1 pod)
kubectl apply -f - << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service-canary
  namespace: shopwave
spec:
  replicas: 1    # 1 canary vs 9 stable = ~10% traffic
  selector:
    matchLabels:
      app: product-service    # SAME selector — existing Service traffic bhejega!
      track: canary
  template:
    metadata:
      labels:
        app: product-service  # Service isko bhi traffic bhejegi!
        track: canary
        version: "2.0.0"
    spec:
      containers:
      - name: product-service
        image: shopwave/product-service:2.0.0
        resources:
          requests: { memory: "128Mi", cpu: "100m" }
          limits: { memory: "512Mi", cpu: "500m" }
EOF

# Monitor error rate (Grafana ya command line)
kubectl logs -l track=canary -n shopwave | grep ERROR | wc -l

# Canary OK? Full rollout
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:2.0.0 -n shopwave
kubectl delete deployment product-service-canary -n shopwave

# Problem? Canary hatao
kubectl delete deployment product-service-canary -n shopwave
# 0% traffic v2 pe — safe!
```

---

## 6.5 Helm — "K8s ka Package Manager"

**Problem bina Helm:**
```
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f deployments.yaml  (5 services)
kubectl apply -f services.yaml     (5 services)
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml
kubectl apply -f networkpolicy.yaml
... (15+ files!)

Dev mein alag values, staging mein alag, prod mein alag
Manually change karo har file mein? Maintenance nightmare!
```

**Helm ka solution:**
```
helm install shopwave ./helm/shopwave \
  --set global.imageTag=1.1.0 \
  --set apiGateway.replicas=3

Ek command! Values automatically inject hoti hain template mein.
```

**Helm Chart Structure:**
```
helm/shopwave/
├── Chart.yaml        ← Metadata (naam, version, description)
├── values.yaml       ← Default values (override kar sakte ho)
└── templates/
    ├── deployment.yaml    ← {{ .Values.apiGateway.replicas }} use karta hai
    ├── service.yaml
    ├── ingress.yaml
    └── hpa.yaml
```

**values.yaml:**
```yaml
# helm/shopwave/values.yaml
global:
  imageRegistry: "shopwave"
  imageTag: "1.0.0"           # Sirf yahan badlo → sab services update!
  namespace: shopwave

apiGateway:
  replicas: 2
  resources:
    requests: { memory: "128Mi", cpu: "100m" }
    limits:   { memory: "256Mi", cpu: "300m" }

productService:
  replicas: 2
  hpa:
    enabled: true
    maxReplicas: 10

# Environment-specific override files:
# dev-values.yaml:  replicas: 1, hpa.enabled: false
# prod-values.yaml: replicas: 3, hpa.enabled: true
```

**Helm Commands:**
```bash
# Install
helm install shopwave ./helm/shopwave -n shopwave --create-namespace

# Status
helm status shopwave -n shopwave
helm list -n shopwave

# Upgrade (new version)
helm upgrade shopwave ./helm/shopwave \
  --set global.imageTag=1.1.0 -n shopwave

# Rollback
helm history shopwave -n shopwave    # Version history
helm rollback shopwave 1 -n shopwave # Version 1 pe wapas

# Values dekho
helm get values shopwave -n shopwave

# Dry run (pehle dekho kya deploy hoga)
helm upgrade shopwave ./helm/shopwave \
  --set global.imageTag=1.1.0 \
  --dry-run --debug -n shopwave

# Uninstall
helm uninstall shopwave -n shopwave

# Dev environment
helm install shopwave-dev ./helm/shopwave \
  -n shopwave-dev \
  --create-namespace \
  -f helm/shopwave/values-dev.yaml   # Dev-specific values
```

---

## 6.6 GitOps with ArgoCD — "Git hi Source of Truth"

**Traditional deployment:**
```
Developer → git push → CI builds image → Someone runs kubectl apply → Prod
Problem: Manual step! Who ran what? When? Rollback? History?
```

**GitOps:**
```
Developer → git push → CI builds image → Git mein manifest update → ArgoCD detects → Auto deploy

ArgoCD hamesha check karta hai:
  Git state == Cluster state? → OK, kuch mat karo
  Git state != Cluster state? → Sync karo! (auto ya manual)

Rollback = git revert → ArgoCD auto-deploy old version
Audit trail = Git history
```

**ArgoCD Install:**
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait
kubectl wait --for=condition=available deployment/argocd-server \
  -n argocd --timeout=120s

# Admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Access
kubectl port-forward svc/argocd-server 8080:443 -n argocd &
# Browser: https://localhost:8080
# Login: admin / (password above)
```

**ArgoCD Application:**
```yaml
# k8s/phase-6-operations/gitops/argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shopwave-production
  namespace: argocd

spec:
  project: default

  source:
    repoURL: https://github.com/yourorg/shopwave-k8s  # Git repo
    targetRevision: main                               # Branch
    path: helm/shopwave                                # Helm chart path

  destination:
    server: https://kubernetes.default.svc            # Same cluster
    namespace: shopwave

  syncPolicy:
    automated:
      prune: true      # Git se hata diya → cluster se bhi hata
      selfHeal: true   # Koi manually kubectl se change kare → ArgoCD wapas kar dega!
    syncOptions:
    - CreateNamespace=true
```

```bash
kubectl apply -f k8s/phase-6-operations/gitops/argocd-app.yaml

# ArgoCD UI mein dekho — shopwave-production app dikhega
# Status: Synced  ← Git aur Cluster match kar rahe hain

# Deployment workflow:
# 1. Code change karo
# 2. Docker image build karo: docker build + docker push
# 3. Git mein image tag update karo: values.yaml mein imageTag badlo
# 4. git commit + git push
# 5. ArgoCD detect karta hai → auto sync → new version deployed!
# 6. ArgoCD UI mein deployment history dekho
```

---

# 🩺 MASTER CHEATSHEET

## Har Situation ke liye Commands

```bash
# ═══════════════════════════════════════════════════════════════
# CLUSTER STATUS — Pehle yeh dekho
# ═══════════════════════════════════════════════════════════════
kubectl get nodes                          # Nodes healthy hain?
kubectl get all -n shopwave                # Sab kuch ek saath
kubectl get pods -n shopwave -o wide       # Pods + node info
kubectl get events -n shopwave --sort-by=.lastTimestamp  # Recent events
kubectl top nodes                          # Node CPU/Memory
kubectl top pods -n shopwave              # Pod CPU/Memory

# ═══════════════════════════════════════════════════════════════
# POD DEBUGGING — 90% issues yahan solve hongi
# ═══════════════════════════════════════════════════════════════
kubectl get pods -n shopwave              # Status dekho
kubectl get pods -n shopwave -w          # Live watch
kubectl describe pod <name> -n shopwave  # Full detail + Events ← MOST IMPORTANT
kubectl logs <name> -n shopwave          # Current logs
kubectl logs <name> -n shopwave --previous  # Crashed pod logs ← KEY
kubectl logs -f <name> -n shopwave       # Follow (live stream)
kubectl logs deployment/product-service -n shopwave  # Deployment ke logs
kubectl exec -it <name> -n shopwave -- /bin/sh       # Shell mein jaao

# ═══════════════════════════════════════════════════════════════
# DEPLOYMENT OPERATIONS
# ═══════════════════════════════════════════════════════════════
kubectl get deployments -n shopwave
kubectl rollout status deployment/<name> -n shopwave   # Update progress
kubectl rollout history deployment/<name> -n shopwave  # Version history
kubectl rollout undo deployment/<name> -n shopwave     # ROLLBACK!
kubectl rollout restart deployment/<name> -n shopwave  # Force restart
kubectl scale deployment/<name> --replicas=5 -n shopwave  # Manual scale
kubectl set image deployment/<name> container=image:tag -n shopwave  # Update image

# ═══════════════════════════════════════════════════════════════
# SERVICE & NETWORKING
# ═══════════════════════════════════════════════════════════════
kubectl get svc -n shopwave
kubectl get endpoints -n shopwave        # Real pod IPs (service selector check)
kubectl describe svc <name> -n shopwave
kubectl port-forward svc/<name> 8080:80 -n shopwave  # Local access

# DNS test
kubectl run dns-test --image=busybox:1.28 --rm -it -n shopwave -- \
  nslookup product-service

# Network test
kubectl run curl-test --image=curlimages/curl --rm -it -n shopwave -- \
  curl -s http://product-service:3002/health

# ═══════════════════════════════════════════════════════════════
# CONFIG & SECRETS
# ═══════════════════════════════════════════════════════════════
kubectl get configmap -n shopwave
kubectl describe configmap shopwave-config -n shopwave
kubectl get secret -n shopwave
# Secret value decode karo
kubectl get secret shopwave-secrets -n shopwave \
  -o jsonpath='{.data.JWT_SECRET}' | base64 -d

# Live config update
kubectl patch configmap shopwave-config -n shopwave \
  --type=merge -p '{"data":{"LOG_LEVEL":"debug"}}'
kubectl rollout restart deployment/product-service -n shopwave

# ═══════════════════════════════════════════════════════════════
# STORAGE
# ═══════════════════════════════════════════════════════════════
kubectl get pvc -n shopwave              # PVCs (Bound/Pending?)
kubectl get pv                           # Physical volumes
kubectl describe pvc <name> -n shopwave  # Pending troubleshoot

# ═══════════════════════════════════════════════════════════════
# RBAC CHECK
# ═══════════════════════════════════════════════════════════════
kubectl auth can-i get secrets \
  --as=system:serviceaccount:shopwave:product-service-sa -n shopwave
kubectl auth can-i delete pods \
  --as=system:serviceaccount:shopwave:product-service-sa -n shopwave

# ═══════════════════════════════════════════════════════════════
# AUTOSCALING
# ═══════════════════════════════════════════════════════════════
kubectl get hpa -n shopwave
kubectl describe hpa product-service-hpa -n shopwave

# ═══════════════════════════════════════════════════════════════
# INGRESS & TLS
# ═══════════════════════════════════════════════════════════════
kubectl get ingress -n shopwave
kubectl describe ingress shopwave-ingress -n shopwave
kubectl get certificate -n shopwave

# ═══════════════════════════════════════════════════════════════
# HELM
# ═══════════════════════════════════════════════════════════════
helm list -n shopwave
helm history shopwave -n shopwave
helm rollback shopwave 1 -n shopwave
helm get values shopwave -n shopwave

# ═══════════════════════════════════════════════════════════════
# FORCE OPERATIONS (EMERGENCY ONLY)
# ═══════════════════════════════════════════════════════════════
# Stuck pod force delete
kubectl delete pod <name> -n shopwave --force --grace-period=0
# Evicted pods cleanup
kubectl get pods -n shopwave --field-selector=status.phase=Failed \
  -o name | xargs kubectl delete -n shopwave
```

---

## Exit Code Reference (Pod crash ka reason)

```
Exit Code 0   → Clean exit (pod successfully band hua)
Exit Code 1   → Application error (code mein bug, config missing)
Exit Code 2   → Bash/shell error
Exit Code 137 → SIGKILL — OOMKilled ya force killed (kubectl delete --force)
Exit Code 139 → Segmentation fault (C/C++ apps)
Exit Code 143 → SIGTERM — Graceful shutdown (normal pod termination)
Exit Code 255 → Exit code -1 (various application errors)
```

## Pod Status Reference

```
Pending         → Schedule nahi hua (resources? PVC? taints?)
Init:0/1        → Init container chal raha hai (dependency wait)
PodInitializing → Init done, main container start ho raha hai
Running         → Chal raha hai
CrashLoopBackOff → Crash + restart loop (logs dekho!)
OOMKilled       → Memory limit exceed
ImagePullBackOff → Image nahi mili (tag? registry? secret?)
Terminating     → Delete ho raha hai
Evicted         → Node pressure se hata diya gaya
Completed       → Job/one-time pod complete
Unknown         → Node se contact nahi (node problem)
```

## Production Deployment Checklist

```
PRE-DEPLOYMENT:
  □ Image tag pinned hai? (latest mat use karo prod mein)
  □ Resource requests/limits set hain?
  □ Liveness + Readiness + Startup probes configured?
  □ Secrets YAML .gitignore mein hai?
  □ ConfigMap values sahi hain?
  □ RBAC least privilege follow kar raha hai?
  □ NetworkPolicy default-deny-all lagayi?
  □ SecurityContext configured (non-root, readOnly)?
  □ HPA configured critical services ke liye?
  □ PVC storageClass sahi environment ka hai?
  □ Monitoring alerts set hain?
  □ Ingress TLS configured?
  □ terminationGracePeriodSeconds set hai?
  □ topologySpreadConstraints set hain? (multi-node)

POST-DEPLOYMENT VERIFY:
  □ kubectl get all -n shopwave → sab Running?
  □ kubectl get pvc -n shopwave → sab Bound?
  □ kubectl get hpa -n shopwave → targets normal?
  □ kubectl get events -n shopwave | grep Warning → koi warnings?
  □ kubectl top pods -n shopwave → resources OK?
  □ Ingress URL curl karo → response aa raha hai?
  □ Grafana dashboards green hain?
  □ Logs mein koi ERROR nahi?
```

---

## Key Concepts — Ek Line Mein

```
Namespace      → Cluster ke andar alag "kamra" — isolation ke liye
Pod            → Ek ya zyada containers ka group — K8s ka atom
ReplicaSet     → "N pods hamesha chalte rahein" ensure karta hai
Deployment     → ReplicaSet + Rolling updates + Rollback
Service        → Pods ka stable DNS naam aur load balancer
ConfigMap      → Non-sensitive config (image se alag)
Secret         → Sensitive data (base64, RBAC protected)
StatefulSet    → Stateful apps (DB) — ordered, stable identity, dedicated storage
PVC            → Storage request ("Mujhe 10GB SSD chahiye")
PV             → Actual storage ("Yeh 20GB SSD available hai")
Ingress        → External traffic → cluster ka single entry point
NetworkPolicy  → Pod-level firewall (default deny + whitelist)
RBAC           → "Kaun kya kar sakta hai" permissions system
ServiceAccount → Pod ki K8s identity
SecurityContext → Container ko cage mein rakho (non-root, readOnly)
HPA            → CPU/Memory based auto-scaling
Prometheus     → Metrics collection aur alerting
Grafana        → Dashboards aur visualization
Loki           → Log aggregation (grep on steroids)
Helm           → K8s package manager (npm jaisa)
ArgoCD         → GitOps — Git == Cluster state
```

---

# 🔄 PHASE WISE APPLY ORDER — "Sahi Sequence Mein Karo"

## Ek naye cluster mein ShopWave deploy karne ka exact order

```bash
# ═══════════════════════════════════════════════════════════════
# STEP 0: Prerequisites
# ═══════════════════════════════════════════════════════════════
# Minikube start karo
minikube start --memory=6144 --cpus=4 --driver=docker

# Addons enable karo
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons enable storage-provisioner

# Verify
kubectl cluster-info
kubectl get nodes
# NAME       STATUS   ROLES           AGE   VERSION
# minikube   Ready    control-plane   1m    v1.28.x

# ═══════════════════════════════════════════════════════════════
# STEP 1: Namespace (sabse pehle — baaki sab iske andar jayenge)
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-1-foundations/01-namespace.yaml

# Verify
kubectl get namespace shopwave
# shopwave   Active   10s  ✓

# Default namespace set karo (har command mein -n shopwave nahi likhna)
kubectl config set-context --current --namespace=shopwave

# ═══════════════════════════════════════════════════════════════
# STEP 2: Secrets aur ConfigMap (deployments se PEHLE zaroori)
# ═══════════════════════════════════════════════════════════════

# Secrets pehle banao (command se, YAML se nahi)
kubectl create secret generic shopwave-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  --from-literal=REDIS_PASSWORD="ShopWave@Redis2024" \
  --from-literal=SMTP_PASSWORD="smtp-password-here" \
  -n shopwave

kubectl create secret generic shopwave-db-secret \
  --from-literal=DB_USER="shopwave" \
  --from-literal=DB_PASSWORD="ShopWaveDB@2024!" \
  -n shopwave

# ConfigMap apply karo
kubectl apply -f k8s/phase-2-config/01-configmap.yaml

# Verify
kubectl get secrets -n shopwave
kubectl get configmap -n shopwave
# shopwave-secrets     Opaque   5      10s  ✓
# shopwave-db-secret   Opaque   2      10s  ✓
# shopwave-config      1        10s         ✓

# ═══════════════════════════════════════════════════════════════
# STEP 3: RBAC (pods deploy hone se pehle identity chahiye)
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-5-security/01-rbac.yaml

# Verify
kubectl get serviceaccount -n shopwave
kubectl get role -n shopwave
kubectl get rolebinding -n shopwave

# ═══════════════════════════════════════════════════════════════
# STEP 4: Infrastructure StatefulSets (DB, Redis, Kafka)
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-3-storage/01-statefulsets.yaml
kubectl apply -f k8s/phase-3-storage/02-redis-statefulset.yaml
kubectl apply -f k8s/phase-3-storage/03-kafka-statefulset.yaml

# Wait karo — important!
echo "Waiting for PostgreSQL..."
kubectl wait --for=condition=ready pod/postgres-0 \
  -n shopwave --timeout=180s
echo "✓ PostgreSQL ready"

echo "Waiting for Redis..."
kubectl wait --for=condition=ready pod/redis-0 \
  -n shopwave --timeout=120s
echo "✓ Redis ready"

echo "Waiting for Kafka..."
kubectl wait --for=condition=ready pod/kafka-0 \
  -n shopwave --timeout=180s
echo "✓ Kafka ready"

# ═══════════════════════════════════════════════════════════════
# STEP 5: Application Deployments
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-1-foundations/03-deployments.yaml

# Progress watch karo
kubectl rollout status deployment/user-service -n shopwave
kubectl rollout status deployment/product-service -n shopwave
kubectl rollout status deployment/order-service -n shopwave
kubectl rollout status deployment/notification-service -n shopwave
kubectl rollout status deployment/api-gateway -n shopwave

# Verify all running
kubectl get pods -n shopwave
# NAME                              READY   STATUS    RESTARTS
# api-gateway-xxx                   1/1     Running   0
# user-service-xxx                  1/1     Running   0
# product-service-xxx               1/1     Running   0
# order-service-xxx                 1/1     Running   0
# notification-service-xxx          1/1     Running   0
# postgres-0                        1/1     Running   0
# redis-0                           1/1     Running   0
# kafka-0                           1/1     Running   0

# ═══════════════════════════════════════════════════════════════
# STEP 6: Services
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-1-foundations/04-services.yaml

# Endpoints check karo (pods se connected hain?)
kubectl get endpoints -n shopwave
# product-service   10.244.1.5:3002,10.244.1.6:3002   ← Pod IPs
# ← Agar endpoints empty hain → selector mismatch hai!

# ═══════════════════════════════════════════════════════════════
# STEP 7: NetworkPolicy
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-4-networking/02-networkpolicy.yaml

# Quick test
kubectl run nettest --image=busybox --rm -it -n shopwave -- \
  wget -qO- --timeout=5 http://product-service:3002/health
# {"status":"ok"} ← Allowed!

# ═══════════════════════════════════════════════════════════════
# STEP 8: Ingress
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-4-networking/01-ingress.yaml

# Minikube IP ke saath hosts file update karo
echo "$(minikube ip) api.shopwave.com" | sudo tee -a /etc/hosts

kubectl get ingress -n shopwave
# shopwave-ingress   nginx   api.shopwave.com   192.168.49.2   80

# ═══════════════════════════════════════════════════════════════
# STEP 9: HPA
# ═══════════════════════════════════════════════════════════════
kubectl apply -f k8s/phase-6-operations/hpa.yaml

kubectl get hpa -n shopwave
# NAME                  TARGETS       MINPODS   MAXPODS   REPLICAS
# api-gateway-hpa       cpu: 5%/60%   2         10        2

# ═══════════════════════════════════════════════════════════════
# STEP 10: Monitoring
# ═══════════════════════════════════════════════════════════════
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  -n shopwave-monitoring --create-namespace \
  --set grafana.adminPassword=shopwave123

kubectl apply -f k8s/phase-6-operations/monitoring.yaml

echo ""
echo "✅ ShopWave fully deployed!"
echo ""
echo "Test commands:"
echo "  curl http://api.shopwave.com/api/products"
echo "  kubectl port-forward svc/api-gateway 3000:80 -n shopwave"
echo "  kubectl port-forward svc/monitoring-grafana 3001:80 -n shopwave-monitoring"
```

---

# 🧪 HANDS-ON EXERCISES — "Sirf Padhne Se Nahi, Karo Toh Seekhoge"

## Exercise 1: Zero Downtime Deployment Verify Karo

```bash
# Terminal 1: Continuous requests bhejo
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    http://api.shopwave.com/api/products)
  echo "$(date '+%H:%M:%S') → HTTP $STATUS"
  sleep 0.5
done

# Terminal 2: Deployment update karo
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:1.0.1 -n shopwave

# Terminal 1 mein dekho: Koi 5xx error nahi aana chahiye!
# Rolling update ke dauran bhi 200 OK milna chahiye

# Expected output Terminal 1:
# 09:15:01 → HTTP 200
# 09:15:02 → HTTP 200    ← Update ke time bhi 200!
# 09:15:03 → HTTP 200
# 09:15:04 → HTTP 200    ← Zero downtime!
```

## Exercise 2: Pod Failure Recovery

```bash
# Terminal 1: Pods watch karo
kubectl get pods -n shopwave -w -l app=product-service

# Terminal 2: Pod forcefully delete karo
POD=$(kubectl get pods -n shopwave -l app=product-service \
  -o jsonpath='{.items[0].metadata.name}')
echo "Deleting: $POD"
kubectl delete pod $POD -n shopwave

# Terminal 1 mein dekho:
# product-service-abc   Running    ← Original
# product-service-abc   Terminating ← Delete signal
# product-service-xyz   Pending    ← Naya pod aa raha hai!
# product-service-xyz   Running    ← Back to 3 replicas!

# Recovery time:
# Typically 10-30 seconds
# readinessProbe pass hone ke baad traffic milega
```

## Exercise 3: OOM Simulation

```bash
# Product service ko 32Mi memory limit do (bahut kam)
kubectl patch deployment product-service -n shopwave --type=json -p='[
  {"op":"replace",
   "path":"/spec/template/spec/containers/0/resources/limits/memory",
   "value":"32Mi"}
]'

# Watch karo
kubectl get pods -n shopwave -l app=product-service -w
# STATUS: OOMKilled → CrashLoopBackOff

# Confirm karo
kubectl describe pod \
  $(kubectl get pods -n shopwave -l app=product-service \
    -o jsonpath='{.items[0].metadata.name}') \
  -n shopwave | grep -A3 "Last State"
# Last State: Terminated
#   Reason: OOMKilled   ← Yahan dikhega!
#   Exit Code: 137

# Fix karo
kubectl patch deployment product-service -n shopwave --type=json -p='[
  {"op":"replace",
   "path":"/spec/template/spec/containers/0/resources/limits/memory",
   "value":"512Mi"}
]'

# Normal hone ka wait karo
kubectl rollout status deployment/product-service -n shopwave
```

## Exercise 4: Secret Missing Simulation

```bash
# JWT_SECRET wala secret delete karo
kubectl delete secret shopwave-secrets -n shopwave

# Pods restart hote dekho
kubectl get pods -n shopwave -w
# user-service-xxx   Running → CrashLoopBackOff

# Error kya hai?
kubectl logs deployment/user-service -n shopwave --previous 2>/dev/null || \
kubectl logs \
  $(kubectl get pods -n shopwave -l app=user-service \
    -o jsonpath='{.items[0].metadata.name}') \
  -n shopwave
# Error: JWT_SECRET is required but not set
# OR: secretKeyRef "shopwave-secrets" not found

# Fix karo
kubectl create secret generic shopwave-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  --from-literal=REDIS_PASSWORD="ShopWave@Redis2024" \
  -n shopwave

# Wait karo recovery ke liye
kubectl rollout status deployment/user-service -n shopwave
echo "✓ Recovered!"
```

## Exercise 5: HPA Load Test

```bash
# HPA status monitor karo
watch -n 5 'kubectl get hpa -n shopwave && echo "" && kubectl get pods -n shopwave -l app=product-service'

# Doosre terminal mein load generate karo
kubectl run load-gen -n shopwave \
  --image=busybox \
  --restart=Never \
  -- sh -c "while true; do wget -qO- http://product-service:3002/api/products; done"

# Expected behavior:
# 0 min:  2 pods, CPU 10%
# 2 min:  4 pods, CPU 60%+  ← HPA scale up!
# 5 min:  8 pods            ← More load → more pods
# Load stop karo
kubectl delete pod load-gen -n shopwave
# 10 min: 6 pods            ← Scale down start (stabilization window)
# 15 min: 2 pods            ← Back to minimum

# Note: HPA scale-down mein 5 min lag sakta hai (stabilizationWindow)
```

## Exercise 6: NetworkPolicy Block Test

```bash
# Policy apply karo (agar nahi ki)
kubectl apply -f k8s/phase-4-networking/02-networkpolicy.yaml

# Test 1: Allowed — api-gateway → product-service
kubectl run test1 --image=curlimages/curl --rm -it -n shopwave \
  --labels="app=api-gateway" \
  -- curl -s http://product-service:3002/health
# {"status":"ok","service":"product-service"} ← ALLOWED!

# Test 2: Blocked — random pod → postgres (direct access)
kubectl run test2 --image=busybox --rm -it -n shopwave \
  -- wget -qO- --timeout=5 tcp://postgres-service:5432 || echo "BLOCKED!"
# wget: download timed out  BLOCKED! ← Good! No direct DB access

# Test 3: Blocked — user-service → order-service (nahi hona chahiye)
kubectl run test3 --image=curlimages/curl --rm -it -n shopwave \
  --labels="app=user-service" \
  -- curl -s --max-time 5 http://order-service:3003/health || echo "BLOCKED!"
# BLOCKED! ← User service order service tak nahi ja sakta
```

## Exercise 7: Blue-Green Deployment

```bash
# Current (blue): product-service v1.0.0

# STEP 1: Green deploy karo
cat << 'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service-green
  namespace: shopwave
spec:
  replicas: 2
  selector:
    matchLabels:
      app: product-service-green
  template:
    metadata:
      labels:
        app: product-service-green
        color: green
    spec:
      containers:
      - name: product-service
        image: shopwave/product-service:1.0.0
        env:
        - name: APP_COLOR
          value: "green"
        resources:
          requests: { memory: "128Mi", cpu: "100m" }
          limits: { memory: "512Mi", cpu: "500m" }
EOF

# STEP 2: Green ready hone ka wait karo
kubectl rollout status deployment/product-service-green -n shopwave

# STEP 3: Green test karo (direct)
kubectl port-forward deployment/product-service-green 3099:3002 -n shopwave &
curl http://localhost:3099/health
kill %1

# STEP 4: SWITCH! (instant, zero downtime)
kubectl patch service product-service -n shopwave \
  -p '{"spec":{"selector":{"app":"product-service-green"}}}'

echo "✓ Switched to GREEN!"
curl http://api.shopwave.com/api/products  # Ab green handle kar raha hai

# STEP 5: Problem hua? Instant rollback!
kubectl patch service product-service -n shopwave \
  -p '{"spec":{"selector":{"app":"product-service"}}}'
echo "✓ Rolled back to BLUE!"

# STEP 6: Green OK hai? Blue hatao
kubectl delete deployment product-service -n shopwave
kubectl rename deployment product-service-green product-service -n shopwave 2>/dev/null || \
  kubectl scale deployment product-service-green --replicas=2 -n shopwave
```

---

# 📝 INTERVIEW PREPARATION — "Phone Screen se System Design tak"

## L1 Questions (Junior/Fresher)

```
Q: Pod aur Container mein kya fark hai?
A: Container = actual software (Docker container).
   Pod = K8s ka wrapper jo ek ya zyada containers hold karta hai.
   Same pod ke containers: same IP, same localhost, same volumes share karte hain.
   ShopWave mein: har service (user, product, order) ka ek container, ek pod mein.

Q: kubectl apply vs kubectl create mein kya fark hai?
A: create → nayi resource banao (already exist karta hai → error)
   apply  → nayi banao ya existing update karo (idempotent)
   Production mein hamesha apply use karo — CI/CD mein safe hai.

Q: Liveness probe aur Readiness probe kab lagaate hain?
A: Liveness:  "Container zinda hai?" — fail = restart.
              Use when: App deadlock mein aa sakti hai, ya infinite loop.
              ShopWave: /health/live endpoint — agar 3 baar fail → restart.
   Readiness: "Traffic le sakta hai?" — fail = Service traffic band karta hai.
              Use when: DB connection banana ho, cache warm-up ho.
              ShopWave: /health/ready → DB connection check karta hai.
              DB down? Pod ready nahi → traffic nahi milega.

Q: ReplicaSet aur Deployment mein kya fark hai?
A: ReplicaSet sirf ensure karta hai N pods chalein.
   Deployment = ReplicaSet + Rolling updates + Rollback history.
   Direct ReplicaSet use rarely karte hain — always Deployment.

Q: K8s mein Secret aur ConfigMap mein kya fark hai?
A: ConfigMap → non-sensitive (DB_HOST, LOG_LEVEL) — plain text.
   Secret    → sensitive (passwords, API keys) — base64 encoded.
   Note: Base64 ≠ Encryption! Production mein Vault use karo.
```

## L2 Questions (Mid-level)

```
Q: Rolling Update zero downtime kaise ensure karta hai?
A: maxSurge:1, maxUnavailable:0 ke saath:
   1. Ek naya pod start karo (surge)
   2. Naya pod readiness probe pass kare
   3. Ek purana pod terminate karo
   4. Repeat
   Hamesha minimum N pods available rehte hain.
   ShopWave: 2 replicas → update ke time 3 pods (1 new + 2 old → 2 new + 1 old → 2 new)

Q: StatefulSet aur Deployment kab use karein?
A: Deployment → stateless (user-service, product-service)
               Pods interchangeable hain
               Random names (product-service-abc123)
   StatefulSet → stateful (postgres, redis, kafka)
               Ordered deployment aur deletion
               Predictable names (postgres-0, postgres-1)
               Har pod ka dedicated PVC
   ShopWave: 5 services = Deployment, DB+Redis+Kafka = StatefulSet

Q: Service ka Endpoint empty hai — kya karo?
A: 1. kubectl describe service <name> → Selector dekho
   2. kubectl get pods --show-labels → Pod labels dekho
   3. Match karo — typically case mismatch ya typo hota hai
   Example: Service selector: app=product-service
            Pod label:        app=ProductService  ← Mismatch!

Q: HPA kab scale up karta hai, kab scale down?
A: Scale up: Current metric > target → turant (stabilizationWindow: 60s)
   Scale down: Current metric < target → 5 min baad (stabilizationWindow: 300s)
   Scale down delay kyun? Traffic wapas aa sakta hai — thrashing avoid karo.
   Formula: desiredReplicas = ceil(current × currentMetric / targetMetric)

Q: NetworkPolicy mein pehle kya apply karo?
A: Pehle default-deny-all, phir specific allows.
   Agar allow pehle diya → other pods bhi access kar sakte hain!
   CRITICAL: DNS allow karna mat bhoolo (port 53 UDP/TCP to kube-system)
   Bina DNS ke koi bhi service naam resolve nahi hoga.
```

## L3 Questions (Senior/SRE)

```
Q: Pod Pending hai — systematic debug approach kya hai?
A: 1. kubectl describe pod → Events section
   2. "Insufficient cpu/memory" → kubectl top nodes → resources add karo
   3. "no matching nodes" → nodeSelector ya affinity check karo
   4. "PVC pending" → kubectl describe pvc → storageClass exist karta hai?
   5. "taint" → node taint check karo → toleration add karo

Q: CrashLoopBackOff — complete debug process?
A: 1. kubectl logs pod --previous  (crash se PEHLE ke logs)
   2. Exit code dekho: 137=OOM, 1=app error, 143=graceful shutdown
   3. kubectl describe pod → env vars aur mounts check karo
   4. Secret/ConfigMap exist karta hai?
   5. kubectl exec -it pod -- sh (agar thodi der chalta hai)
   6. Image locally run karo: docker run shopwave/service:tag

Q: Production mein memory leak detect kaise karein?
A: 1. kubectl top pods → memory trend dekho (growing?)
   2. kubectl get pods → RESTARTS count dekho (zyada = OOMKilled)
   3. Metrics: nodejs_heap_size_used_bytes → growing?
   4. Active handles: process._getActiveHandles().length → normal ~5-10
   5. Code review: axios instances, DB connections, setInterval clear?
   6. VPA install karo → right sizing recommendations
   7. Node.js: --max-old-space-size=400 set karo container mein

Q: Blue-Green vs Canary vs Rolling — kab kya use karein?
A: Rolling Update:
     Default. Good for minor updates.
     Slow rollback (undo command).
     ShopWave: Routine image updates.
   
   Blue-Green:
     Instant switch. Instant rollback.
     Double resources temporarily.
     ShopWave: DB schema changes, breaking API changes.
   
   Canary:
     Gradual rollout. Early error detection.
     Complex to set up.
     ShopWave: New payment flow — pehle 10% users pe test.
   
   A/B Testing:
     Business logic test (not just stability).
     Header/cookie based routing.
     ShopWave: New UI checkout flow test.

Q: etcd corruption ho gayi — kya karoge?
A: 1. Control plane down hai → existing pods chalte rahenge (kubelet independent)
   2. New pods schedule nahi honge (scheduler down)
   3. etcd backup se restore karo
   4. Backup strategy: Velero ya etcdctl snapshot
   5. RPO/RTO define karo: kitna data loss acceptable?
   Prevention:
     - Regular etcd snapshots (har ghante)
     - Multi-node etcd cluster (3 ya 5 nodes)
     - etcd monitoring aur disk space alert
```

## System Design Question: "ShopWave K8s Architecture Design Karo"

```
Interviewer: "10 million users ke liye ShopWave K8s mein design karo"

Answer framework:

1. MULTI-REGION SETUP:
   - Primary region: ap-south-1 (Mumbai)
   - DR region:      ap-southeast-1 (Singapore)
   - Global LB: AWS Route53 / Cloudflare

2. CLUSTER TOPOLOGY:
   - EKS managed cluster (AWS)
   - Node groups:
     * General: m5.xlarge (API, User, Product services)
     * Memory: r5.2xlarge (Redis, caching heavy)
     * Spot: m5.large (Notification, batch jobs — cost save)

3. SERVICES SCALING:
   - API Gateway:      HPA 5-50 pods (CPU 60%)
   - Product Service:  HPA 5-30 pods (CPU 60% + cache miss rate)
   - Order Service:    HPA 3-20 pods (CPU 60%)
   - User Service:     HPA 3-15 pods
   - Notification:     HPA 2-10 pods (Kafka lag based — KEDA)

4. DATABASE:
   - RDS Aurora PostgreSQL (managed, multi-AZ)
   - ElastiCache Redis Cluster (managed)
   - MSK Kafka (managed)
   - No self-managed StatefulSets in production at scale

5. SECURITY:
   - Private subnets mein worker nodes
   - NAT Gateway for egress
   - VPC Peering / PrivateLink for services
   - IAM Roles for Service Accounts (IRSA)
   - AWS Secrets Manager + External Secrets Operator
   - OPA/Gatekeeper for policy enforcement

6. OBSERVABILITY:
   - Prometheus + Grafana (Thanos for long-term storage)
   - Loki for logs
   - Jaeger/Tempo for distributed tracing
   - PagerDuty for alerts

7. CI/CD:
   - GitHub Actions: build + test + push image
   - ArgoCD: GitOps deployment
   - Argo Rollouts: Advanced deployment strategies

8. COST OPTIMIZATION:
   - Spot instances for non-critical workloads (60-70% savings)
   - VPA recommendations
   - Cluster Autoscaler
   - Karpenter (faster, cost-optimal node provisioning)
```

---

# 🚀 PRODUCTION READINESS — "Startup se Enterprise tak"

## Day 1 (MVP/Startup)
```
✅ Minikube ya small managed K8s (1-3 nodes)
✅ Deployment + Service + Ingress
✅ Basic ConfigMap + Secrets (kubectl create)
✅ Resource limits set
✅ Readiness + Liveness probes
✅ Basic Prometheus + Grafana
```

## Day 30 (Growing Startup)
```
✅ HPA configured
✅ StatefulSets for DBs
✅ NetworkPolicy default-deny
✅ RBAC least privilege
✅ SecurityContext non-root
✅ Loki logging
✅ Alert rules (service down, high errors)
✅ Helm charts
✅ Multiple environments (dev, staging, prod)
```

## Day 90 (Scale)
```
✅ ArgoCD GitOps
✅ External Secrets Operator + Vault
✅ VPA recommendations
✅ Blue-Green / Canary deployments
✅ Distributed tracing (Jaeger/Tempo)
✅ Chaos Engineering (Chaos Monkey)
✅ Disaster Recovery tested
✅ SLA/SLO defined aur monitored
✅ Runbooks for common incidents
✅ Post-mortem culture
```

## Day 180 (Enterprise)
```
✅ Multi-region deployment
✅ Managed K8s (EKS/GKE/AKS)
✅ Managed databases (RDS, ElastiCache)
✅ Service Mesh (Istio/Linkerd)
✅ OPA/Gatekeeper policies
✅ Cost optimization (Spot, Karpenter)
✅ Compliance (SOC2, PCI-DSS)
✅ Dedicated SRE team
✅ On-call rotation
```

---

# 🔑 GOLDEN RULES — "Yaad Rakhne Wali Baatein"

```
1.  "latest" image tag KABHI production mein mat use karo
    → Pinned tag use karo: shopwave/product-service:1.0.0

2.  Secret YAML kabhi Git mein mat daalo
    → .gitignore mein daalo, kubectl create se banao

3.  Base64 ≠ Encryption
    → Production mein Vault use karo

4.  Resources requests/limits HAMESHA set karo
    → Bina limits ke ek pod puri node kha sakta hai

5.  Default namespace use mat karo production mein
    → Dedicated namespace: kubectl create namespace shopwave

6.  "default" ServiceAccount avoid karo
    → Custom SA with least privilege RBAC

7.  readOnlyRootFilesystem: true lagao containers mein
    → /tmp ke liye emptyDir volume mount karo

8.  StatefulSet ke pods seedhe delete mat karo normally
    → kubectl scale statefulset postgres --replicas=0 pehle

9.  PVC delete karne se pehle data backup karo
    → kubectl exec postgres-0 -- pg_dump > backup.sql

10. NetworkPolicy mein DNS allow karna mat bhoolo
    → Port 53 UDP/TCP to kube-system namespace

11. Probe failureThreshold carefully set karo
    → Bahut kam → frequent restarts, bahut zyada → slow detection

12. terminationGracePeriodSeconds set karo
    → In-flight requests ko complete hone ka time do (30s minimum)

13. topologySpreadConstraints use karo
    → Pods alag nodes pe spread karo (single node failure tolerance)

14. Rolling update ke time maxUnavailable:0 use karo
    → Zero downtime guarantee

15. HPA ke saath VPA bhi monitor karo
    → Right-sizing recommendations le — na zyada na kam resources
```

---

# 📊 QUICK REFERENCE TABLES

## Probe Timing Guide

```
Service Type    | initialDelaySeconds | periodSeconds | failureThreshold
----------------|---------------------|---------------|------------------
Fast API        | 5-10                | 10            | 3
DB Connection   | 15-20               | 10            | 3
Kafka Consumer  | 25-30               | 20            | 3
Heavy Init      | 30-60               | 20            | 5
Startup Probe   | N/A                 | 10            | 30 (5 min total)
```

## Resource Sizing Guide (Starting Points)

```
Service             | Memory Request | Memory Limit | CPU Request | CPU Limit
--------------------|----------------|--------------|-------------|----------
API Gateway         | 128Mi          | 256Mi        | 100m        | 300m
User Service        | 128Mi          | 512Mi        | 100m        | 500m
Product Service     | 128Mi          | 512Mi        | 100m        | 500m
Order Service       | 256Mi          | 768Mi        | 200m        | 1000m
Notification Svc    | 128Mi          | 256Mi        | 50m         | 200m
PostgreSQL          | 256Mi          | 2Gi          | 250m        | 2000m
Redis               | 128Mi          | 512Mi        | 100m        | 500m
Kafka               | 512Mi          | 2Gi          | 500m        | 1000m
Prometheus          | 512Mi          | 2Gi          | 200m        | 1000m
Grafana             | 128Mi          | 512Mi        | 100m        | 500m
```

## HPA Scaling Behavior

```
Condition          | Action          | Wait Time
-------------------|-----------------|----------
CPU > 60%          | Scale UP        | 60s stabilization
CPU < 60%          | Scale DOWN      | 300s stabilization
Memory > 75%       | Scale UP        | 60s
Add pods           | Max 2 per min   | Per policy
Remove pods        | Max 1 per 2 min | Per policy
Min replicas       | 2               | Never go below
Max replicas       | 10              | Never go above
```

## Common kubectl Shortcuts

```bash
# Aliases set karo (~/.bashrc ya ~/.zshrc mein)
alias k='kubectl'
alias kn='kubectl -n shopwave'
alias kga='kubectl get all -n shopwave'
alias kgp='kubectl get pods -n shopwave'
alias kl='kubectl logs -n shopwave'
alias kd='kubectl describe -n shopwave'
alias ke='kubectl exec -it -n shopwave'

# Ab:
kgp                              # kubectl get pods -n shopwave
kl deployment/product-service   # logs dekho
kd pod/product-service-abc      # describe karo
ke product-service-abc -- sh    # shell mein jaao
```

---

*"K8s seekhne ka sabse accha tarika hai haath gande karne se —
commands chalao, cheezein todao, phir theek karo.
ShopWave isi liye hai — ek real application jisme sab experiment karo."*

**Happy Shipping! 🚀**
