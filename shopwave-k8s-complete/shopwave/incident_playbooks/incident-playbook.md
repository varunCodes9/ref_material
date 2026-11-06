# 🚨 ShopWave — Production Incident Playbook
## Hinglish mein — Real K8s Debugging Guide

---

## Incident 1: CrashLoopBackOff

### Kya hota hai?
Pod start hota hai, crash karta hai, phir restart hota hai, phir crash — infinite loop.
K8s exponential backoff karta hai: 10s → 20s → 40s → 80s → 5min.

```
NAME                          READY   STATUS             RESTARTS   AGE
user-service-abc123           0/1     CrashLoopBackOff   8          15m
```

### Cause karein (intentionally break karo)
```bash
# JWT_SECRET missing karo
kubectl patch deployment user-service -n shopwave --type=json \
  -p='[{"op":"remove","path":"/spec/template/spec/containers/0/env/2"}]'

# Ya galat image tag dalo
kubectl set image deployment/user-service user-service=shopwave/user-service:99.99.99 -n shopwave
```

### Investigation Steps

```bash
# STEP 1: Pod status dekho
kubectl get pods -n shopwave
# Output mein RESTARTS column dekho — zyada restarts = CrashLoop

# STEP 2: Describe karo — Events section sabse important hai
kubectl describe pod <pod-name> -n shopwave
# Neeche "Events" section mein dekho:
# Warning  BackOff    2m    kubelet  Back-off restarting failed container

# STEP 3: Logs dekho — CURRENT run
kubectl logs <pod-name> -n shopwave
# Agar pod abhi bhi crash ho raha hai aur logs empty hain:

# STEP 4: PREVIOUS run ke logs dekho (crash se pehle kya hua)
kubectl logs <pod-name> -n shopwave --previous
# Yahan actual error milega!
# Example output:
# Error: JWT_SECRET environment variable is required
# Process exited with code 1

# STEP 5: Agar pod thodi der ke liye chalta hai — live logs
kubectl logs -f <pod-name> -n shopwave

# STEP 6: Container ke andar jaao (agar pod thodi der chalta hai)
kubectl exec -it <pod-name> -n shopwave -- /bin/sh
# Andar se check karo: env | grep JWT, node -e "require('./src/index.js')"
```

### Root Cause Analysis
```bash
# Sabse common causes:
# 1. Missing environment variable / secret
kubectl describe pod <pod-name> -n shopwave | grep -A5 "Environment"

# 2. Secret exist nahi karta
kubectl get secret shopwave-secrets -n shopwave
# Error: not found → secret create karo

# 3. Wrong image / entrypoint
kubectl describe pod <pod-name> -n shopwave | grep Image

# 4. Application code crash — logs mein stack trace milega
kubectl logs <pod-name> -n shopwave --previous | tail -50
```

### Fix
```bash
# Fix 1: Secret wapas banao
kubectl create secret generic shopwave-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  --from-literal=REDIS_PASSWORD=ShopWaveRedis2024 \
  -n shopwave

# Fix 2: Deployment restart karo
kubectl rollout restart deployment/user-service -n shopwave

# Fix 3: Rollback karo (agar code change wajah se crash)
kubectl rollout undo deployment/user-service -n shopwave

# Verify
kubectl rollout status deployment/user-service -n shopwave
kubectl get pods -n shopwave
```

### Production Best Practices
```
1. Startup probe use karo — liveness se pehle startup check
2. initialDelaySeconds adequate rakho
3. Resource limits set karo (OOM bhi CrashLoop cause karta hai)
4. Secrets exist karein DEPLOYMENT se PEHLE
5. Readiness probe fail karna CrashLoop nahi karta — use it wisely
```

---

## Incident 2: ImagePullBackOff

### Kya hota hai?
```
NAME                    READY   STATUS             RESTARTS
product-service-xyz     0/1     ImagePullBackOff   0
```
Pod image hi pull nahi kar paa raha — isliye start hi nahi hua.

### Cause karein
```bash
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:VERSION-DOES-NOT-EXIST \
  -n shopwave
```

### Investigation
```bash
# STEP 1: Describe — Events mein exact error
kubectl describe pod <pod-name> -n shopwave
# Events section mein:
# Warning  Failed   2m   kubelet  Failed to pull image "shopwave/product-service:99.0":
#                                 rpc error: ... not found

# STEP 2: Image name/tag sahi hai?
kubectl get deployment product-service -n shopwave -o jsonpath='{.spec.template.spec.containers[0].image}'

# STEP 3: Private registry? imagePullSecret exist karta hai?
kubectl get secret -n shopwave | grep registry
kubectl describe pod <pod-name> -n shopwave | grep -A3 "Image Pull"
```

### Common Causes aur Fix

```bash
# Cause 1: Wrong image tag
# Fix:
kubectl set image deployment/product-service \
  product-service=shopwave/product-service:1.0.0 \
  -n shopwave

# Cause 2: Private registry — imagePullSecret nahi hai
# Fix: Docker registry secret banao
kubectl create secret docker-registry shopwave-registry-secret \
  --docker-server=ghcr.io \
  --docker-username=your-github-username \
  --docker-password=your-github-token \
  -n shopwave

# Deployment mein add karo:
kubectl patch deployment product-service -n shopwave --type=json -p='[
  {"op":"add","path":"/spec/template/spec/imagePullSecrets","value":[{"name":"shopwave-registry-secret"}]}
]'

# Cause 3: Image exist hi nahi karta
# Fix: Pehle image build aur push karo
cd services/product-service
docker build -t shopwave/product-service:1.0.0 .
docker push shopwave/product-service:1.0.0
# Ya local minikube ke liye:
eval $(minikube docker-env)
docker build -t shopwave/product-service:1.0.0 .
```

---

## Incident 3: OOMKilled (Out of Memory)

### Kya hota hai?
```
NAME                    READY   STATUS      RESTARTS   AGE
order-service-abc       0/1     OOMKilled   3          10m
```
Memory limit exceed hui → Kernel ne process kill kar di.

### Cause karein
```bash
# Memory leak simulate karo — deployment mein 64Mi limit set karo
kubectl patch deployment order-service -n shopwave --type=json -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"32Mi"}
]'
# Order service 32Mi mein nahi chalega → OOMKilled!
```

### Investigation
```bash
# STEP 1: Pod status
kubectl get pods -n shopwave
# OOMKilled ya CrashLoopBackOff dikhega

# STEP 2: Describe karo — reason dekho
kubectl describe pod <pod-name> -n shopwave
# Containers section mein:
# State: Terminated
#   Reason: OOMKilled
#   Exit Code: 137  ← 137 = OOM ki pehchaan hai!

# STEP 3: Memory usage dekho (metrics-server zaroori hai)
kubectl top pods -n shopwave
kubectl top pods -n shopwave --sort-by=memory

# STEP 4: Previous logs (OOM se pehle kya tha)
kubectl logs <pod-name> -n shopwave --previous | tail -30
```

### Fix
```bash
# Memory limit badhaao
kubectl patch deployment order-service -n shopwave --type=json -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/resources/requests/memory","value":"256Mi"},
  {"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"512Mi"}
]'

# Verify
kubectl rollout status deployment/order-service -n shopwave
kubectl top pods -n shopwave
```

### Production Best Practices
```
1. Requests/Limits ratio: limit = 2x request (reasonable burst allow karo)
2. Node memory se zyada request mat karo
3. VPA (Vertical Pod Autoscaler) use karo — automatically recommend karta hai
4. Application mein heap size limit set karo: node --max-old-space-size=384 src/index.js
   (Node.js default heap = ~1.5GB — limit se zyada bhi ja sakta hai!)
```

---

## Incident 4: Database Connection Failure

### Kya hota hai?
```
user-service pod: "Error: connect ECONNREFUSED postgres-service:5432"
```
Application DB se connect nahi kar pa rahi.

### Cause karein
```bash
# postgres Service ka selector tod do
kubectl patch service postgres-service -n shopwave -p \
  '{"spec":{"selector":{"app":"wrong-label"}}}'
# Ab postgres-service kisi pod ko traffic nahi bhejega
```

### Investigation
```bash
# STEP 1: Logs mein error dekho
kubectl logs deployment/user-service -n shopwave | grep -i "error\|connect\|refused"

# STEP 2: Service exist karta hai?
kubectl get service postgres-service -n shopwave

# STEP 3: Service ka selector sahi pods pe point kar raha hai?
kubectl describe service postgres-service -n shopwave
# "Endpoints" section dekho — agar empty hai, koi pod match nahi hoga!
# Endpoints: <none>   ← PROBLEM YAHAN HAI

# STEP 4: Postgres pod chal raha hai?
kubectl get pods -n shopwave -l app=postgres
kubectl describe pod postgres-0 -n shopwave

# STEP 5: DNS sahi kaam kar raha hai? (debug pod se check karo)
kubectl run dns-debug --image=busybox:1.28 --rm -it -n shopwave -- nslookup postgres-service
# Expected: Address: 10.x.x.x  ← Service ka ClusterIP
# Problem: "can't resolve" ← NetworkPolicy ya DNS issue

# STEP 6: Direct connectivity test
kubectl run pg-test --image=postgres:16-alpine --rm -it -n shopwave -- \
  psql -h postgres-service -U shopwave -d shopwave_users -c "SELECT 1"
```

### Fix
```bash
# Service selector fix karo
kubectl patch service postgres-service -n shopwave -p \
  '{"spec":{"selector":{"app":"postgres"}}}'

# Verify endpoints
kubectl get endpoints postgres-service -n shopwave
# Output: postgres-service   10.x.x.x:5432   5m  ← Ab sahi hai!

# Services aur pods ke labels match karo
kubectl get pods -n shopwave -l app=postgres --show-labels
kubectl describe service postgres-service -n shopwave | grep Selector
```

---

## Incident 5: DNS Failure

### Kya hota hai?
```
order-service: "Error: getaddrinfo ENOTFOUND product-service"
```
Service DNS se resolve nahi ho raha.

### Investigation
```bash
# STEP 1: DNS debug pod chalao
kubectl run dns-debug --image=busybox:1.28 --rm -it -n shopwave -- sh

# Pod ke andar:
nslookup product-service                    # Same namespace — short name
nslookup product-service.shopwave           # Namespace specify
nslookup product-service.shopwave.svc.cluster.local  # Full FQDN

# STEP 2: CoreDNS pods chal rahe hain?
kubectl get pods -n kube-system -l k8s-app=kube-dns

# STEP 3: CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns | tail -20

# STEP 4: NetworkPolicy DNS block kar rahi hai?
kubectl get networkpolicy -n shopwave
# "allow-dns" policy exist karti hai?

# STEP 5: Service exist karta hai?
kubectl get service product-service -n shopwave
```

### Fix
```bash
# Fix 1: NetworkPolicy mein DNS allow karo (agar missing hai)
kubectl apply -f - << 'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
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
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
EOF

# Fix 2: CoreDNS restart (agar stuck hai)
kubectl rollout restart deployment/coredns -n kube-system

# Fix 3: Service recreate (agar corrupt hai)
kubectl delete service product-service -n shopwave
kubectl apply -f k8s/phase-1-foundations/04-services.yaml -n shopwave
```

---

## Incident 6: Kafka Connectivity Issue

### Kya hota hai?
```
order-service: "KafkaJSConnectionError: Connection timeout"
notification-service: "KafkaJSError: The group coordinator is not available"
```

### Investigation
```bash
# STEP 1: Kafka pod chal raha hai?
kubectl get pods -n shopwave -l app=kafka
kubectl get pods -n shopwave -l app=zookeeper

# STEP 2: Kafka logs
kubectl logs statefulset/kafka -n shopwave | tail -30
# Zookeeper connected hai?
# "INFO [KafkaServer id=1] started (kafka.server.KafkaServer)"

# STEP 3: Kafka service endpoints
kubectl get endpoints kafka-service -n shopwave

# STEP 4: Kafka ke andar jaake topics check karo
kubectl exec -it kafka-0 -n shopwave -- kafka-topics \
  --bootstrap-server localhost:9092 --list

# STEP 5: order-service se kafka reachable hai?
kubectl exec -it deployment/order-service -n shopwave -- \
  wget -qO- http://kafka-service:9092 || echo "Cannot reach kafka"

# STEP 6: Consumer group status
kubectl exec -it kafka-0 -n shopwave -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 --list
kubectl exec -it kafka-0 -n shopwave -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 --describe --group notification-group
```

### Fix
```bash
# Fix 1: Kafka restart
kubectl rollout restart statefulset/kafka -n shopwave
# Wait for it
kubectl wait --for=condition=ready pod/kafka-0 -n shopwave --timeout=120s

# Fix 2: Zookeeper pehle restart (Kafka Zookeeper pe depend karta hai)
kubectl rollout restart deployment/zookeeper -n shopwave
sleep 30
kubectl rollout restart statefulset/kafka -n shopwave

# Fix 3: Topic manually create karo (agar auto-create off hai)
kubectl exec -it kafka-0 -n shopwave -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --create --topic order-events \
  --partitions 3 --replication-factor 1

# Fix 4: Consumer group lag dekho aur reset karo
kubectl exec -it kafka-0 -n shopwave -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group notification-group \
  --reset-offsets --to-latest --all-topics --execute
```

---

## Incident 7: Ingress Not Working

### Symptoms
```
curl https://api.shopwave.com/api/products
→ 404 Not Found  OR  502 Bad Gateway  OR  Connection refused
```

### Investigation
```bash
# STEP 1: Ingress resource dekho
kubectl get ingress -n shopwave
kubectl describe ingress shopwave-ingress -n shopwave
# "Address" field mein IP hona chahiye — agar blank hai, controller nahi chala

# STEP 2: Ingress Controller pods
kubectl get pods -n ingress-nginx
# Agar koi pod nahi → controller install nahi hai!

# STEP 3: Ingress Controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller | tail -30
# 502 errors? Backend pods ready nahi hain

# STEP 4: Backend service reachable hai?
kubectl get svc api-gateway -n shopwave
kubectl get endpoints api-gateway -n shopwave
# Endpoints empty? → Pod ready nahi hai ya selector mismatch

# STEP 5: Direct service test (bypass ingress)
kubectl port-forward svc/api-gateway 8080:80 -n shopwave &
curl http://localhost:8080/health
# Agar yeh kaam karta hai → Ingress issue, service theek hai

# STEP 6: TLS certificate status
kubectl get certificate -n shopwave
kubectl describe certificate shopwave-tls -n shopwave
```

### Fix
```bash
# Fix 1: Ingress controller install (minikube)
minikube addons enable ingress
# Ya Helm se:
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace

# Fix 2: /etc/hosts update karo (local testing)
MINIKUBE_IP=$(minikube ip)
echo "$MINIKUBE_IP api.shopwave.com" | sudo tee -a /etc/hosts

# Fix 3: 502 Bad Gateway — Backend pod fix karo
kubectl get pods -n shopwave  # Sabse pehle pods ready hone do
kubectl rollout status deployment/api-gateway -n shopwave

# Fix 4: Annotation check karo
kubectl describe ingress shopwave-ingress -n shopwave | grep "kubernetes.io/ingress.class"
# Nginx controller use karta hai: kubernetes.io/ingress.class: nginx
```

---

## Incident 8: PVC Pending

### Kya hota hai?
```
kubectl get pvc -n shopwave
NAME                          STATUS    VOLUME   CAPACITY
postgres-data-postgres-0      Pending   <none>   <none>
```
Pod start nahi ho raha kyunki storage provision nahi hua.

### Investigation
```bash
# STEP 1: PVC describe karo
kubectl describe pvc postgres-data-postgres-0 -n shopwave
# Events mein:
# "no persistent volumes available for this claim"
# "storageclass.storage.k8s.io "gp3" not found"

# STEP 2: Available StorageClasses
kubectl get storageclass
# Minikube mein: standard
# AWS EKS mein: gp2, gp3
# GKE mein:     standard, premium-rwo

# STEP 3: PV available hain?
kubectl get pv

# STEP 4: Events dekho
kubectl get events -n shopwave | grep -i "pvc\|volume\|pending"
```

### Fix
```bash
# Fix 1: StorageClass naam fix karo
# Minikube mein "standard" use hota hai, AWS mein "gp2" ya "gp3"
kubectl get storageclass  # Available classes dekho

# PVC ka storageClass update karo (pehle delete, phir recreate)
kubectl delete statefulset postgres -n shopwave --cascade=orphan
# StatefulSet delete karo par PVC mat hatao

# Phir sahi storageClass ke saath redeploy karo
kubectl apply -f k8s/phase-3-storage/01-statefulsets.yaml

# Fix 2: Local PV manually banao (development ke liye)
kubectl apply -f - << 'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
spec:
  capacity:
    storage: 10Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: standard
  hostPath:
    path: /data/shopwave/postgres
EOF

# Fix 3: Minikube mein provisioner enable karo
minikube addons enable default-storageclass
minikube addons enable storage-provisioner
```

---

## Quick Reference — Debugging Cheatsheet

```bash
# ═══════════════════════════════════════════════════
# PODS
# ═══════════════════════════════════════════════════
kubectl get pods -n shopwave                          # Status dekho
kubectl get pods -n shopwave -w                       # Live watch
kubectl get pods -n shopwave -o wide                  # Node info bhi
kubectl describe pod <name> -n shopwave               # Full detail + Events
kubectl logs <name> -n shopwave                       # Current logs
kubectl logs <name> -n shopwave --previous            # Crashed pod logs
kubectl logs -f <name> -n shopwave                    # Follow logs (live)
kubectl logs deployment/user-service -n shopwave      # Deployment ke logs
kubectl exec -it <name> -n shopwave -- /bin/sh        # Shell access

# ═══════════════════════════════════════════════════
# DEPLOYMENTS
# ═══════════════════════════════════════════════════
kubectl get deployments -n shopwave
kubectl rollout status deployment/<name> -n shopwave  # Update progress
kubectl rollout history deployment/<name> -n shopwave # Version history
kubectl rollout undo deployment/<name> -n shopwave    # Rollback!
kubectl rollout restart deployment/<name> -n shopwave # Force restart

# ═══════════════════════════════════════════════════
# SERVICES & NETWORKING
# ═══════════════════════════════════════════════════
kubectl get svc -n shopwave
kubectl get endpoints -n shopwave                     # Real pod IPs
kubectl describe svc <name> -n shopwave
kubectl port-forward svc/<name> 8080:80 -n shopwave  # Local access

# ═══════════════════════════════════════════════════
# CONFIG & SECRETS
# ═══════════════════════════════════════════════════
kubectl get configmap -n shopwave
kubectl get secret -n shopwave
kubectl describe configmap shopwave-config -n shopwave
kubectl get secret shopwave-secrets -n shopwave -o jsonpath='{.data.JWT_SECRET}' | base64 -d

# ═══════════════════════════════════════════════════
# EVENTS (sabse important for debugging!)
# ═══════════════════════════════════════════════════
kubectl get events -n shopwave                        # All events
kubectl get events -n shopwave --sort-by=.lastTimestamp  # Newest last
kubectl get events -n shopwave | grep Warning         # Sirf warnings

# ═══════════════════════════════════════════════════
# RESOURCE USAGE
# ═══════════════════════════════════════════════════
kubectl top pods -n shopwave                          # CPU/Memory
kubectl top nodes                                     # Node resources
kubectl top pods -n shopwave --sort-by=memory
kubectl top pods -n shopwave --sort-by=cpu

# ═══════════════════════════════════════════════════
# STORAGE
# ═══════════════════════════════════════════════════
kubectl get pvc -n shopwave
kubectl get pv
kubectl describe pvc <name> -n shopwave

# ═══════════════════════════════════════════════════
# RBAC TESTING
# ═══════════════════════════════════════════════════
kubectl auth can-i get pods -n shopwave --as=system:serviceaccount:shopwave:user-service-sa
kubectl auth can-i delete secrets -n shopwave --as=system:serviceaccount:shopwave:user-service-sa

# ═══════════════════════════════════════════════════
# SCALE
# ═══════════════════════════════════════════════════
kubectl scale deployment product-service --replicas=5 -n shopwave
kubectl get hpa -n shopwave

# ═══════════════════════════════════════════════════
# NAMESPACE ALL-IN-ONE
# ═══════════════════════════════════════════════════
kubectl get all -n shopwave                           # Sab kuch ek saath
```
