# 🎯 ShopWave K8s Interview Questions
## DevOps/SRE ke liye — Hinglish mein

---

## Basics (L1)

**Q1: Pod aur Container mein kya fark hai?**
> Container = Docker container. Pod = K8s ka smallest deployable unit jo ek ya zyada containers wrap karta hai.
> Ek pod ke saare containers same network namespace aur localhost share karte hain.
> ShopWave mein: har service ka ek container, ek pod mein.

**Q2: Deployment vs StatefulSet kab use karein?**
> Deployment = stateless apps (user-service, product-service) — pods interchangeable hain.
> StatefulSet = stateful apps (postgres, redis, kafka) — har pod ka unique identity aur dedicated storage zaroori hai.
> ShopWave mein: 5 services Deployment mein, DB/Redis/Kafka StatefulSet mein.

**Q3: ClusterIP vs NodePort vs LoadBalancer kya hai?**
> ClusterIP = sirf cluster ke andar (hamare saare internal services).
> NodePort = Node ke IP se accessible (dev/testing).
> LoadBalancer = Cloud provider se external IP milti hai (production ingress ke saath).

**Q4: Liveness probe aur Readiness probe ka fark?**
> Liveness: "Container zinda hai?" — Fail = restart.
> Readiness: "Container traffic le sakta hai?" — Fail = Service traffic band karta hai, restart nahi.
> ShopWave mein: readiness probe DB connection check karta hai — DB down? Pod traffic nahi lega.

**Q5: ConfigMap vs Secret kab use karein?**
> ConfigMap = non-sensitive (DB_HOST, LOG_LEVEL, feature flags).
> Secret = sensitive (passwords, API keys, certificates). Base64 encoded, RBAC se protected.

---

## Intermediate (L2)

**Q6: Rolling Update kaise zero-downtime ensure karta hai?**
> maxSurge:1 = ek extra pod temporarily banao.
> maxUnavailable:0 = koi pod band nahi.
> Flow: Naya pod ready hua → ek purana pod hatao → repeat.
> ShopWave mein: 2 replicas → update ke time 3 pods (2 old + 1 new) → 2 (1 old + 1 new) → 2 new.

**Q7: HPA kaise kaam karta hai?**
> Metrics Server se CPU/Memory data leta hai har 15 sec.
> Current replicas × current utilization / target utilization = desired replicas.
> Example: 2 pods × 80% CPU / 60% target = 2.67 → 3 pods.

**Q8: NetworkPolicy ke bina kya problem hai?**
> Koi bhi pod kisi bhi pod se baat kar sakta hai.
> notification-service ko postgres directly access kyun karna chahiye?
> Zero-trust networking ke liye NetworkPolicy zaroori hai.

**Q9: PVC delete karo toh data jaata hai kya?**
> Depends on reclaimPolicy:
> Delete (default in cloud) = PVC delete → PV delete → data gone.
> Retain = PVC delete → PV remain → data safe, manual cleanup zaroori.
> ShopWave production mein: Retain policy use karo!

**Q10: RBAC mein Role vs ClusterRole kya hai?**
> Role = namespace-scoped. RoleBinding se assign.
> ClusterRole = cluster-wide. ClusterRoleBinding se assign.
> ShopWave mein: shopwave-app-role sirf "shopwave" namespace pe apply hoti hai.

---

## Advanced (L3)

**Q11: Pod stuck hai Pending state mein — debug karo.**
```
Reasons:
1. Resources nahi hain: kubectl describe pod → "Insufficient cpu/memory"
   Fix: Node resources badhao ya resources/requests kam karo
2. StorageClass exist nahi: kubectl describe pvc
   Fix: Sahi storageClass naam use karo
3. NodeSelector mismatch: pod specific node type maang raha hai jo exist nahi
   Fix: NodeSelector remove karo ya node label lagao
4. Taints/tolerations: Node tainted hai, pod tolerate nahi karta
   Fix: Toleration add karo deployment mein
```

**Q12: Service ka Endpoint empty hai — kya problem hai?**
```
kubectl get endpoints product-service -n shopwave
→ product-service   <none>   5m

Diagnosis:
- Service selector: kubectl describe svc product-service | grep Selector
- Pod labels: kubectl get pods -l app=product-service -n shopwave --show-labels
- Mismatch! Service: app=product-service, Pod: app=ProductService (case sensitive!)
Fix: Labels match karo exactly.
```

**Q13: etcd kya hai aur kyun important hai?**
> etcd = K8s ka distributed key-value database. Poora cluster state yahan store hota hai.
> Sab Deployments, Pods, Secrets, ConfigMaps — sab etcd mein.
> etcd down = koi nayi cheez create/update nahi ho sakti (existing pods chalte rahenge).
> Production mein: etcd ka regular backup ZAROORI hai.

**Q14: Blue-Green vs Canary deployment kab use karein?**
> Blue-Green: Instant switch — ek command se new version. Rollback bhi instant. Double resources.
>   ShopWave use case: Major breaking changes (DB schema change).
> Canary: Gradual rollout — 10% → 25% → 50% → 100%. Slow. Error detect early.
>   ShopWave use case: New payment flow — pehle 10% users pe test karo.

**Q15: K8s mein secret data kitna secure hai?**
> Default mein: etcd mein base64 encoded (NOT encrypted!). Koi bhi etcd access kar le → secrets plain text.
> Production security:
>   1. EncryptionConfig enable karo (etcd encryption at rest)
>   2. External Secrets Operator + Vault/AWS Secrets Manager
>   3. RBAC se secret access restrict karo
>   4. Audit logging enable karo
> ShopWave mein: secrets.yaml sirf example hai — real prod mein Vault use karo.

---

## Scenario-Based (L3/L4)

**Q16: Production mein order-service ki memory suddenly 900% badh gayi — kya karoge?**
```bash
# 1. Immediate: Pod check
kubectl top pods -n shopwave --sort-by=memory

# 2. Agar OOMKilled nahi hua: Pod describe + logs
kubectl logs deployment/order-service -n shopwave | grep -i "error\|memory\|leak"

# 3. Heap dump (agar Node.js): 
kubectl exec -it <pod> -n shopwave -- node -e "process._getActiveHandles().length"

# 4. Temporary fix: Pod restart + memory limit badhaao
kubectl rollout restart deployment/order-service -n shopwave
kubectl patch deployment order-service -n shopwave --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"1Gi"}]'

# 5. Root cause: Kafka consumer message accumulation? DB connection pool leak?
# Code fix deploy karo phir

# 6. Permanent: VPA install karo — automatically recommend karta hai
```

**Q17: ShopWave pe Diwali sale hai — 10x traffic expect hai. Kya karoge?**
```bash
# 1. Pre-scale karo (HPA ka wait mat karo)
kubectl scale deployment api-gateway --replicas=10 -n shopwave
kubectl scale deployment product-service --replicas=8 -n shopwave
kubectl scale deployment order-service --replicas=6 -n shopwave

# 2. HPA limits temporarily badhaao
kubectl patch hpa api-gateway-hpa -n shopwave --type=json \
  -p='[{"op":"replace","path":"/spec/maxReplicas","value":20}]'

# 3. Redis cache TTL badhaao (DB load kam karo)
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p='{"data":{"CACHE_TTL_SECONDS":"600"}}'

# 4. DB connection pool badhaao
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p='{"data":{"DB_MAX_CONNECTIONS":"50"}}'

# 5. Monitor karo
watch kubectl top pods -n shopwave
kubectl get hpa -n shopwave -w

# 6. Sale ke baad: Normal pe wapas
kubectl scale deployment api-gateway --replicas=2 -n shopwave
```

---

## Hands-on Exercises

### Exercise 1: Zero-downtime Rolling Update
```bash
# Terminal 1: Load test chalao
kubectl run load-test --image=busybox --rm -it -n shopwave -- \
  sh -c "while true; do wget -qO- http://api-gateway.shopwave.svc/health; sleep 0.1; done"

# Terminal 2: Update karo aur dekho koi error nahi aaya
kubectl set image deployment/api-gateway \
  api-gateway=shopwave/api-gateway:1.0.1 -n shopwave
kubectl rollout status deployment/api-gateway -n shopwave

# Verify: Load test mein koi connection error nahi hona chahiye
```

### Exercise 2: Secret Rotation (Zero-downtime)
```bash
# 1. Naya secret create karo
kubectl create secret generic shopwave-secrets-v2 \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  -n shopwave

# 2. Deployment update karo new secret use karne ke liye
# 3. Rolling restart karo
kubectl rollout restart deployment/user-service -n shopwave

# 4. Verify: Purane tokens kab expire honge? (15 min — JWT expiry)
# 5. Purana secret delete karo
kubectl delete secret shopwave-secrets -n shopwave
```

### Exercise 3: Chaos Engineering
```bash
# Random pod kill karo aur dekho K8s kaise recover karta hai
kubectl delete pod $(kubectl get pods -n shopwave -l app=product-service \
  -o jsonpath='{.items[0].metadata.name}') -n shopwave

# Immediately dekho — naya pod aa raha hai!
kubectl get pods -n shopwave -w

# Deployment history
kubectl rollout history deployment/product-service -n shopwave
```
