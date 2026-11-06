# 🚨 ShopWave — Production Incident Playbook Vol. 2
## Real-world K8s incidents — Investigate, Debug, Fix, Prevent
### Hinglish mein — SRE/DevOps ke liye

---

> **Kaise use karein yeh playbook:**
> Har incident mein yeh structure hai:
> 1. 🔴 **Alert** — Tumhe kya dikha/pager ne kya bheja
> 2. 🔍 **Investigation** — Step-by-step commands
> 3. 🧠 **Root Cause** — Actual wajah kya thi
> 4. 🔧 **Fix** — Immediate + permanent solution
> 5. 📊 **Postmortem** — Aage se rokne ke liye kya karo
>
> Har command ke baad expected output bhi diya hai — taki pata chale sahi ja rahe ho ya nahi.

---

## Incident 9: Thundering Herd — Redis Cache Stampede

### 🔴 Alert
```
PagerDuty: PostgreSQL CPU 95% — Critical
Grafana:   shopwave_product_cache_misses_total → spike 0 to 50,000/min
Slack:     "Site is slow, products page 30 sec lag raha hai"
Time:      Monday 9:00 AM (jab sab log office aake shopping karte hain)
```

### Kya hua samajhte hain pehle
```
Raat 3 AM: Redis ka pod restart hua (OOM) → sab cache delete
9 AM: 10,000 users ek saath product page open karte hain
Cache miss → sab DB pe query karte hain ek saath
DB overwhelm → slow response → timeout → retry → aur load
Yeh hai "Thundering Herd" problem
```

### 🔍 Investigation
```bash
# STEP 1: Symptoms confirm karo
kubectl top pods -n shopwave
# NAME                          CPU(cores)   MEMORY
# postgres-0                    1950m        800Mi   ← 95% CPU!
# product-service-xxx           450m         380Mi
# redis-0                       2m           45Mi    ← Redis barely kuch kar raha hai

# STEP 2: Cache hit rate check karo
kubectl exec -it deployment/product-service -n shopwave -- \
  wget -qO- http://localhost:3002/metrics | grep cache
# shopwave_product_cache_hits_total 12
# shopwave_product_cache_misses_total 48932   ← Yeh problem hai!

# STEP 3: Redis mein keys hain?
kubectl exec -it redis-0 -n shopwave -- redis-cli -a $REDIS_PASSWORD DBSIZE
# (integer) 0   ← Khali hai! Sab cache gone

# STEP 4: Redis kab restart hua?
kubectl describe pod redis-0 -n shopwave | grep -A5 "Last State"
# Last State: Terminated
#   Reason: OOMKilled
#   Finished: Mon Oct 14 03:14:22 2024   ← Raat 3 baje OOMKilled tha

# STEP 5: DB queries kya chal rahi hain?
kubectl exec -it postgres-0 -n shopwave -- psql -U shopwave -c \
  "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY calls DESC LIMIT 5;"
# SELECT p.*, c.name... | 48932 | 245ms   ← Same query 48k baar!

# STEP 6: Connection pool exhausted?
kubectl exec -it postgres-0 -n shopwave -- psql -U shopwave -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
# count: 98   ← Pool almost full (max 100 tha)
```

### 🧠 Root Cause
```
1. Redis OOMKilled raat ko (memory limit kam thi)
2. Subah traffic spike → sab cache miss → DB direct hit
3. DB connection pool exhaust → slow queries → timeout cascade
```

### 🔧 Fix

**Immediate (fire bujhao):**
```bash
# 1. Product service temporarily scale down karo — DB load kam karo
kubectl scale deployment product-service --replicas=1 -n shopwave

# 2. Cache warmup karo manually (script se)
kubectl exec -it deployment/product-service -n shopwave -- \
  node -e "
    const axios = require('axios');
    const Redis = require('ioredis');
    const { Pool } = require('pg');
    // Popular products fetch karo aur cache mein daalo
    console.log('Cache warming started...');
  "

# 3. DB max connections temporarily badhaao
kubectl exec -it postgres-0 -n shopwave -- psql -U shopwave -c \
  "ALTER SYSTEM SET max_connections = 200; SELECT pg_reload_conf();"

# 4. Wapas scale karo
kubectl scale deployment product-service --replicas=4 -n shopwave
```

**Permanent Fix — Redis memory badhaao:**
```bash
# Redis StatefulSet mein memory limit badhaao
kubectl patch statefulset redis -n shopwave --type=json -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/resources/limits/memory",
    "value": "1Gi"
  },
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/resources/requests/memory",
    "value": "512Mi"
  }
]'

# Redis restart hoga — data loss hoga (theek hai, cache hi hai)
kubectl rollout restart statefulset/redis -n shopwave
```

**Code fix — Cache stampede prevent karo (product-service mein):**
```javascript
// BEFORE (problem): Sab ek saath cache miss karte hain
const cacheGet = async (key) => {
  const val = await redis.get(key);
  if (!val) return null;  // Cache miss → sab DB jaate hain
  return JSON.parse(val);
};

// AFTER (fix): Probabilistic early expiry + mutex lock
const cacheGetWithLock = async (key, fetchFn, ttl = 300) => {
  const val = await redis.get(key);
  
  if (val) {
    const { data, expiry } = JSON.parse(val);
    const remaining = expiry - Date.now();
    
    // Probabilistic early recompute: 10% chance jab 20% time bacha ho
    // Yeh cache stampede rok deta hai — sab ek saath expire nahi hote
    if (remaining > ttl * 0.2 * 1000 || Math.random() > 0.1) {
      return data;
    }
  }
  
  // Mutex lock: sirf ek request DB se fetch kare
  const lockKey = `lock:${key}`;
  const locked = await redis.set(lockKey, '1', 'NX', 'EX', 10);
  
  if (!locked) {
    // Lock nahi mila → thodi der wait karo aur retry
    await new Promise(r => setTimeout(r, 100));
    return cacheGetWithLock(key, fetchFn, ttl);
  }
  
  try {
    const data = await fetchFn();
    const payload = JSON.stringify({ data, expiry: Date.now() + ttl * 1000 });
    // Jitter add karo: TTL ± 10% random — sab ek saath expire na hon
    const jitter = Math.floor(Math.random() * ttl * 0.1);
    await redis.set(key, payload, 'EX', ttl + jitter);
    return data;
  } finally {
    await redis.del(lockKey);
  }
};
```

**ConfigMap mein cache TTL fix:**
```bash
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p '{"data":{"CACHE_TTL_SECONDS":"600","CACHE_JITTER_SECONDS":"60"}}'
kubectl rollout restart deployment/product-service -n shopwave
```

### 📊 Postmortem
```
What happened: Redis OOM → cache cold → DB overwhelmed
Timeline:
  03:14 - Redis OOMKilled
  09:00 - Traffic spike
  09:02 - DB CPU 95%
  09:08 - Page load 30s
  09:15 - Investigation started
  09:45 - Cache warmup done, DB load normal
  10:00 - Post-incident fixes deployed

Action items:
  □ Redis memory limit 256Mi → 1Gi
  □ Cache stampede protection code add karo
  □ Redis OOM alert lagao (memory > 80%)
  □ Cache warmup script CI/CD mein add karo
  □ DB connection pool monitoring
```

---

## Incident 10: Order Service Memory Leak — Slow Death

### 🔴 Alert
```
Grafana: order-service memory slowly 150Mi → 480Mi → 510Mi (limit 512Mi)
Alert:   "order-service memory > 85% for 10 minutes"
Symptom: Har 6 ghante mein automatically restart hota hai
         Orders intermittently fail ho rahe hain
```

### 🔍 Investigation
```bash
# STEP 1: Memory trend dekho
kubectl top pods -n shopwave -l app=order-service
# NAME                    CPU    MEMORY
# order-service-abc123    45m    487Mi   ← Near limit!

# STEP 2: Restart count dekho — baar baar restart?
kubectl get pods -n shopwave -l app=order-service
# NAME                    READY   STATUS    RESTARTS   AGE
# order-service-abc123    1/1     Running   7          2d   ← 7 restarts in 2 days!

# STEP 3: Previous pod logs — crash se pehle kya tha?
kubectl logs order-service-abc123 -n shopwave --previous | tail -50
# FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
#  1: 0xb7c6e0 node::Abort()
# Writing Node.js report to file: report.20241014.094523.json

# STEP 4: Heap usage over time (agar metrics expose ho rahi hain)
kubectl exec -it deployment/order-service -n shopwave -- \
  wget -qO- http://localhost:3003/metrics | grep heap
# nodejs_heap_size_used_bytes 4.89e+08   ← 489MB heap!
# nodejs_heap_size_total_bytes 5.12e+08

# STEP 5: Active handles check karo
kubectl exec -it deployment/order-service -n shopwave -- \
  node -e "console.log('handles:', process._getActiveHandles().length)"
# handles: 2847   ← Bohot zyada! Normal: 5-10

# STEP 6: Kafka consumer check
kubectl exec -it deployment/order-service -n shopwave -- \
  node -e "
    const { Kafka } = require('kafkajs');
    const k = new Kafka({brokers:['kafka-service:9092']});
    const admin = k.admin();
    admin.connect().then(() =>
      admin.describeGroups(['order-group']).then(g => {
        console.log(JSON.stringify(g, null, 2));
        admin.disconnect();
      })
    );
  "
```

### 🧠 Root Cause
```
order-service mein Kafka consumer tha jo ORDER_STATUS events sunता था.
Har event pe ek naya axios instance banta tha (bina close kiye).
Axios connections pool accumulate hote rahe → memory leak.

Dusra issue: Event listeners accumulate ho rahe the —
setInterval clear nahi ho raha tha graceful shutdown mein.
```

### 🔧 Fix

**Immediate:**
```bash
# Rolling restart karo — memory release hogi temporarily
kubectl rollout restart deployment/order-service -n shopwave

# Memory limit thodi badhaao — band-aid fix
kubectl patch deployment order-service -n shopwave --type=json -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"768Mi"}
]'
```

**Permanent code fix:**
```javascript
// services/order-service/src/index.js mein yeh changes karo

// BEFORE (leak): Har request pe naya axios
const checkProduct = async (productId) => {
  const res = await axios.get(`${PRODUCT_SERVICE}/api/products/${productId}`);
  return res.data;
  // axios instance kabhi close nahi hua!
};

// AFTER (fixed): Shared axios instance with proper config
const http = axios.create({
  baseURL: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002',
  timeout: 5000,
  // Connection pool reuse karo
  httpAgent:  new require('http').Agent({ keepAlive: true, maxSockets: 10 }),
  httpsAgent: new require('https').Agent({ keepAlive: true, maxSockets: 10 }),
});

// BEFORE (leak): setInterval clear nahi kiya
const startMetricsCollection = () => {
  setInterval(() => {
    activeOrders.set(getActiveOrderCount());
  }, 5000);
  // Interval kabhi clear nahi hua!
};

// AFTER (fixed): Graceful shutdown mein clear karo
let metricsInterval;
const startMetricsCollection = () => {
  metricsInterval = setInterval(() => {
    activeOrders.set(getActiveOrderCount());
  }, 5000);
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  clearInterval(metricsInterval);      // Interval clear
  await producer.disconnect();          // Kafka disconnect
  await db.end();                       // DB pool close
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force kill after 30s
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
```

**Dockerfile mein heap limit set karo:**
```dockerfile
# services/order-service/Dockerfile mein
ENV NODE_OPTIONS="--max-old-space-size=400"
# 400MB heap limit — 512MB container limit se kam
# Jab heap 400MB se badhe → graceful error, OOMKill nahi
CMD ["node", "--max-old-space-size=400", "src/index.js"]
```

**VPA install karo — automatically right size recommend karta hai:**
```bash
# VPA install
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.tar.gz

# VPA object create karo
kubectl apply -f - << 'EOF'
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: order-service-vpa
  namespace: shopwave
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  updatePolicy:
    updateMode: "Off"   # Sirf recommend karo, auto-change mat karo (production safe)
  resourcePolicy:
    containerPolicies:
    - containerName: order-service
      minAllowed:
        memory: "128Mi"
        cpu: "50m"
      maxAllowed:
        memory: "2Gi"
        cpu: "2000m"
EOF

# Recommendations dekho (kuch din baad)
kubectl describe vpa order-service-vpa -n shopwave
# Recommendation:
#   Container: order-service
#     Lower Bound: 256Mi / 100m
#     Target:      512Mi / 200m
#     Upper Bound: 1Gi / 500m
```

---

## Incident 11: Kafka Consumer Lag — Notification Backlog

### 🔴 Alert
```
Alert:   "Kafka consumer lag > 10,000 messages"
Symptom: Users order karte hain, confirmation email 2 ghante baad aa raha hai
         Kabhi kabhi email hi nahi aata
```

### 🔍 Investigation
```bash
# STEP 1: Consumer lag check karo
kubectl exec -it kafka-0 -n shopwave -- kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe --group notification-group
# GROUP              TOPIC        PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# notification-group order-events 0          1250            12847           11597  ← 11k lag!

# STEP 2: Notification service logs
kubectl logs deployment/notification-service -n shopwave --tail=100
# [2024-10-14T09:15:23] ERROR: Email send failed: SMTP timeout after 30000ms
# [2024-10-14T09:15:54] ERROR: Email send failed: SMTP timeout after 30000ms
# [2024-10-14T09:16:25] ERROR: Email send failed: SMTP timeout after 30000ms
# Har message 30 sec timeout → bohot slow!

# STEP 3: SMTP connection test
kubectl exec -it deployment/notification-service -n shopwave -- \
  node -e "
    const net = require('net');
    const sock = net.connect(587, 'smtp.sendgrid.net', () => {
      console.log('SMTP Connected!');
      sock.destroy();
    });
    sock.on('error', e => console.log('SMTP Error:', e.message));
    setTimeout(() => { sock.destroy(); console.log('Timeout!'); }, 5000);
  "
# Timeout!   ← SMTP unreachable hai!

# STEP 4: NetworkPolicy check
kubectl get networkpolicy -n shopwave
kubectl describe networkpolicy allow-notification-service -n shopwave
# Egress sirf postgres aur kafka allow hai
# SMTP (port 587) BLOCKED hai!

# STEP 5: Kafka topic health
kubectl exec -it kafka-0 -n shopwave -- kafka-topics \
  --bootstrap-server localhost:9092 --describe --topic order-events
# Topic: order-events PartitionCount: 1 ReplicationFactor: 1
# Sirf 1 partition! Consumer ek hi thread se read kar sakta hai

# STEP 6: Message processing rate
kubectl logs deployment/notification-service -n shopwave | \
  grep "Email sent" | wc -l
# 23   ← Sirf 23 emails bheje last 1 hour mein
```

### 🧠 Root Cause
```
Do problems ek saath:
1. NetworkPolicy ne SMTP outbound traffic block kar diya tha
   (Kisi ne NetworkPolicy update kari thi bina SMTP allow kiye)
2. Kafka topic mein sirf 1 partition → sirf 1 consumer thread
   Notification service bottleneck ban gayi

Result: Messages accumulate hone lage, emails bounce karne lage
```

### 🔧 Fix

**Immediate — NetworkPolicy fix:**
```bash
kubectl apply -f - << 'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-notification-service
  namespace: shopwave
spec:
  podSelector:
    matchLabels:
      app: notification-service
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - port: 3004
  egress:
  # DB
  - to:
    - podSelector: { matchLabels: { app: postgres } }
    ports: [{ port: 5432 }]
  # Kafka
  - to:
    - podSelector: { matchLabels: { app: kafka } }
    ports: [{ port: 9092 }, { port: 29092 }]
  # SMTP — YAHAN ADD KIYA
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except: [10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16]
    ports:
    - port: 587   # SMTP STARTTLS
    - port: 465   # SMTP SSL
    - port: 443   # HTTPS (SendGrid API)
  # DNS
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - port: 53
      protocol: UDP
EOF

# Verify SMTP ab accessible hai
kubectl exec -it deployment/notification-service -n shopwave -- \
  node -e "
    const net = require('net');
    net.connect(587, 'smtp.sendgrid.net', () => console.log('✓ SMTP Connected!'));
  "
```

**Kafka partitions badhaao — parallel processing:**
```bash
# Existing topic ka partition count badhaao
kubectl exec -it kafka-0 -n shopwave -- kafka-topics \
  --bootstrap-server localhost:9092 \
  --alter --topic order-events \
  --partitions 3

# Notification service replicas badhaao (3 partitions = 3 consumers max)
kubectl scale deployment notification-service --replicas=3 -n shopwave

# Consumer lag monitor karo
watch -n 10 kubectl exec -it kafka-0 -n shopwave -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group notification-group
# LAG should decrease now
```

**Dead Letter Queue add karo (failed messages ke liye):**
```javascript
// notification-service/src/index.js mein

const consumer = kafka.consumer({ groupId: 'notification-group' });
const dlqProducer = kafka.producer(); // Dead Letter Queue producer

await consumer.run({
  eachMessage: async ({ topic, partition, message, heartbeat }) => {
    const event = JSON.parse(message.value.toString());
    let attempts = 0;
    
    while (attempts < 3) {
      try {
        await heartbeat(); // Kafka ko batao "alive hoon"
        await processNotification(event);
        return; // Success — exit loop
      } catch (err) {
        attempts++;
        logger.warn(`Attempt ${attempts} failed`, { event: event.event, error: err.message });
        
        if (attempts < 3) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(r => setTimeout(r, Math.pow(2, attempts) * 1000));
        }
      }
    }
    
    // 3 attempts fail — Dead Letter Queue mein bhejo
    logger.error('Message sent to DLQ after 3 failures', { orderId: event.orderId });
    await dlqProducer.send({
      topic: 'order-events-dlq',  // Dead Letter Queue topic
      messages: [{
        key: message.key,
        value: message.value,
        headers: {
          'original-topic': topic,
          'failure-reason': 'max-retries-exceeded',
          'failed-at': new Date().toISOString()
        }
      }]
    });
  }
});
```

---

## Incident 12: Multi-Pod Race Condition — Duplicate Orders

### 🔴 Alert
```
Support ticket: "User ne ek order diya, 3 orders create ho gayi!"
Database check: Same user_id, same items, same timestamp ± 2 seconds
Affected users: ~50 in last hour
Time: High traffic period
```

### 🔍 Investigation
```bash
# STEP 1: Duplicate orders DB mein check karo
kubectl exec -it postgres-0 -n shopwave -- psql -U shopwave -d shopwave_orders -c "
  SELECT 
    user_id,
    COUNT(*) as order_count,
    MIN(created_at) as first_order,
    MAX(created_at) as last_order,
    MAX(created_at) - MIN(created_at) as time_diff
  FROM orders
  WHERE created_at > NOW() - INTERVAL '2 hours'
  GROUP BY user_id
  HAVING COUNT(*) > 1
  ORDER BY order_count DESC
  LIMIT 10;
"
# user_id                               | order_count | time_diff
# 550e8400-e29b-41d4-a716-446655440000  | 3           | 00:00:02.3

# STEP 2: Order service pods kitne hain?
kubectl get pods -n shopwave -l app=order-service
# order-service-xxx-1   Running
# order-service-xxx-2   Running   ← 2 pods hain!

# STEP 3: Request logs — ek request multiple pods ne handle ki?
kubectl logs order-service-xxx-1 -n shopwave | grep "550e8400"
# POST /api/orders userId=550e8400 orderId=abc-111

kubectl logs order-service-xxx-2 -n shopwave | grep "550e8400"
# POST /api/orders userId=550e8400 orderId=abc-222
# Dono pods ne same request handle ki!

# STEP 4: Retry logic check karo
# API Gateway mein proxy retry tha? Ya client ne double click kiya?
kubectl logs deployment/api-gateway -n shopwave | grep "550e8400"
# POST /api/orders 504 → retry → POST /api/orders 201
# Gateway ne timeout pe retry kiya — original request already process ho rahi thi!
```

### 🧠 Root Cause
```
API Gateway mein proxy timeout 5s tha.
Order creation (product stock check + DB write + Kafka) sometimes 6-8s leta tha.
Gateway ne 5s timeout ke baad retry kiya.
Original request complete ho gayi → duplicate!

Plus: Order creation DB transaction atomic nahi thi properly.
```

### 🔧 Fix

**Immediate — Idempotency key add karo:**
```javascript
// order-service/src/index.js

app.post('/api/orders', async (req, res) => {
  const userId = req.headers['x-user-id'];
  
  // Idempotency key — client se aata hai ya gateway generate karta hai
  const idempotencyKey = req.headers['x-idempotency-key'] || 
                         `${userId}-${Date.now()}`;
  
  // Redis mein check karo — kya yeh request already process ho rahi hai?
  const lockKey = `order-lock:${idempotencyKey}`;
  const alreadyProcessing = await redis.set(lockKey, '1', 'NX', 'EX', 30);
  
  if (!alreadyProcessing) {
    // Already process ho rahi hai ya ho chuki hai
    // Cached result return karo
    const cachedResult = await redis.get(`order-result:${idempotencyKey}`);
    if (cachedResult) {
      return res.status(200).json({ 
        ...JSON.parse(cachedResult), 
        idempotent: true  // Client ko batao yeh cached response hai
      });
    }
    // Processing chal rahi hai — 202 Accepted
    return res.status(202).json({ message: 'Order is being processed', idempotencyKey });
  }
  
  try {
    // ... order creation logic ...
    const orderResult = { order: { ...order, items: enrichedItems } };
    
    // Result cache karo 24 ghante ke liye
    await redis.set(`order-result:${idempotencyKey}`, JSON.stringify(orderResult), 'EX', 86400);
    
    res.status(201).json(orderResult);
  } catch (err) {
    await redis.del(lockKey); // Lock release on error
    throw err;
  }
});
```

**DB level unique constraint:**
```bash
kubectl exec -it postgres-0 -n shopwave -- psql -U shopwave -d shopwave_orders -c "
  -- Idempotency key column add karo
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency 
    ON orders(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
"
```

**API Gateway timeout fix:**
```bash
kubectl patch configmap shopwave-config -n shopwave --type=merge -p '{
  "data": {
    "GATEWAY_PROXY_TIMEOUT": "30000",
    "GATEWAY_ORDER_TIMEOUT": "30000"
  }
}'
# API Gateway mein order route ke liye longer timeout
kubectl rollout restart deployment/api-gateway -n shopwave
```

---

## Incident 13: Node Pressure — Pod Eviction Cascade

### 🔴 Alert
```
K8s Event: "Node shopwave-node-2 has disk pressure"
Pods:       Multiple pods suddenly "Evicted" status
Alert:      "5 pods evicted in shopwave namespace"
```

### 🔍 Investigation
```bash
# STEP 1: Node status dekho
kubectl get nodes
# NAME               STATUS                     ROLES    AGE
# shopwave-node-1    Ready                      worker   30d
# shopwave-node-2    Ready,MemoryPressure        worker   30d   ← Problem!
# shopwave-node-3    Ready                      worker   30d

# STEP 2: Node describe — conditions dekho
kubectl describe node shopwave-node-2
# Conditions:
#   MemoryPressure:  True    ← Memory crit
#   DiskPressure:    True    ← Disk bhi!
#   PIDPressure:     False
#   Ready:           True (still running but struggling)
#
# Allocatable:
#   memory: 7.6Gi
# Allocated resources:
#   memory: 7.2Gi (94.7%)   ← Almost full!

# STEP 3: Evicted pods dekho
kubectl get pods -n shopwave --field-selector=status.phase=Failed | grep Evicted
# product-service-abc   0/1   Evicted   0   45m
# user-service-xyz      0/1   Evicted   0   43m

# STEP 4: Node pe disk usage
kubectl debug node/shopwave-node-2 -it --image=ubuntu -- df -h
# /dev/sda1  100G  98G  2G  98%  /   ← 98% full!

# STEP 5: Container logs bhar gayi hain?
kubectl debug node/shopwave-node-2 -it --image=ubuntu -- \
  du -sh /var/log/containers/* 2>/dev/null | sort -rh | head -20
# 24G  /var/log/containers/product-service-xxx_shopwave_product.log
# 18G  /var/log/containers/order-service-xxx_shopwave_order.log
# Logs bahut badi ho gayi hain!

# STEP 6: Kaunsa pod sabse zyada disk use kar raha hai
kubectl get pods -n shopwave -o json | \
  python3 -c "
import json, sys
pods = json.load(sys.stdin)['items']
for p in pods:
    name = p['metadata']['name']
    node = p.get('spec', {}).get('nodeName', 'unscheduled')
    print(f'{name}: {node}')
  "
```

### 🔧 Fix

**Immediate — Disk clear karo:**
```bash
# Evicted pods clean karo (resource waste hain)
kubectl get pods -n shopwave --field-selector=status.phase=Failed \
  -o name | xargs kubectl delete -n shopwave

# Node pe jao aur logs clean karo
kubectl debug node/shopwave-node-2 -it --image=ubuntu -- bash
# Node shell mein:
journalctl --vacuum-size=1G
docker system prune -f        # Old images, containers
# Ya containerd ke liye:
crictl rmi --prune

# Completed/Failed pods ke logs manually delete karo
find /var/log/containers -name "*.log" -size +1G -delete
```

**Permanent — Log rotation configure karo:**
```yaml
# /etc/docker/daemon.json on each node
# Ya container runtime config mein
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",   # Har log file max 100MB
    "max-file": "3"       # Sirf 3 files rakhni hain
  }
}
```

**K8s level log limits (Deployment mein):**
```bash
# Product service ka log level production mein "info" rakho "debug" nahi
kubectl patch configmap shopwave-config -n shopwave --type=merge \
  -p '{"data":{"LOG_LEVEL":"warn"}}'  # Temporarily warn level
kubectl rollout restart deployment/product-service -n shopwave
```

**Resource Quotas lagao — ek namespace zyada resources na kha sake:**
```bash
kubectl apply -f - << 'EOF'
apiVersion: v1
kind: ResourceQuota
metadata:
  name: shopwave-quota
  namespace: shopwave
spec:
  hard:
    requests.cpu: "8"          # Total max CPU requests
    requests.memory: "16Gi"    # Total max memory requests
    limits.cpu: "16"
    limits.memory: "32Gi"
    persistentvolumeclaims: "10"
    pods: "50"                 # Max 50 pods in shopwave namespace
---
apiVersion: v1
kind: LimitRange
metadata:
  name: shopwave-limits
  namespace: shopwave
spec:
  limits:
  - type: Container
    default:                   # Agar koi limit specify na kare
      memory: "256Mi"
      cpu: "200m"
    defaultRequest:            # Agar koi request specify na kare
      memory: "128Mi"
      cpu: "100m"
    max:                       # Maximum allowed
      memory: "2Gi"
      cpu: "2000m"
    min:                       # Minimum required
      memory: "64Mi"
      cpu: "10m"
EOF
```

---

## Incident 14: Slow Rolling Update — Deployment Stuck

### 🔴 Alert
```
CI/CD pipeline stuck: "Deployment rollout timeout after 10 minutes"
kubectl get pods → New pods stuck in "Pending" or "Init:0/1"
Old pods still running, new pods nahi aa rahe
```

### 🔍 Investigation
```bash
# STEP 1: Rollout status dekho
kubectl rollout status deployment/product-service -n shopwave
# Waiting for deployment "product-service" rollout to finish:
# 1 out of 2 new replicas have been updated...
# (Stuck yahan!)

# STEP 2: New pod kya kar raha hai?
kubectl get pods -n shopwave -l app=product-service
# NAME                          READY   STATUS    RESTARTS
# product-service-OLD-abc       1/1     Running   0
# product-service-NEW-xyz       0/1     Pending   0   ← Stuck!

# STEP 3: Pending pod describe karo
kubectl describe pod product-service-NEW-xyz -n shopwave
# Events:
# Warning  FailedScheduling  5m  default-scheduler
#   0/3 nodes are available:
#   1 Insufficient cpu.
#   2 node(s) had untolerated taint {node.kubernetes.io/not-ready: }
# → CPU nahi hai schedule karne ke liye!

# STEP 4: Node resources
kubectl top nodes
# NAME              CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# shopwave-node-1   1920m        96%    7100Mi           93%
# shopwave-node-2   1850m        92%    6800Mi           89%
# shopwave-node-3   1900m        95%    7200Mi           95%
# Teeno nodes almost full!

# STEP 5: Kya zyada pods hain? (HPA ne scale up kiya tha?)
kubectl get pods -n shopwave | wc -l
# 47   ← Zyada pods hain

# STEP 6: HPA status
kubectl get hpa -n shopwave
# product-service-hpa   product-service   cpu: 95%/60%   2/8   8
# HPA ne 8 pods tak scale kiya! Resources nahi hain naye pod ke liye.
```

### 🧠 Root Cause
```
HPA ne high traffic pe scale up kiya → 8 pods.
Deployment update start hua → maxSurge:1 matlab 9th pod chahiye.
Nodes pe resources nahi → 9th pod Pending.
Rollout stuck.
```

### 🔧 Fix

**Immediate — Rollout pause karo, resources free karo:**
```bash
# Rollout pause karo pehle
kubectl rollout pause deployment/product-service -n shopwave

# HPA temporarily reduce karo
kubectl patch hpa product-service-hpa -n shopwave --type=merge \
  -p '{"spec":{"minReplicas":2,"maxReplicas":4}}'

# Kuch time baad — HPA scale down karega
sleep 60
kubectl top nodes  # Resources free hue?

# Rollout resume karo
kubectl rollout resume deployment/product-service -n shopwave
kubectl rollout status deployment/product-service -n shopwave
```

**Permanent — Update strategy fix karo:**
```bash
kubectl patch deployment product-service -n shopwave --type=json -p='[
  {
    "op": "replace",
    "path": "/spec/strategy/rollingUpdate/maxSurge",
    "value": 0
  },
  {
    "op": "replace",
    "path": "/spec/strategy/rollingUpdate/maxUnavailable",
    "value": 1
  }
]'
# maxSurge:0 = extra pod nahi banao
# maxUnavailable:1 = ek purana pod pehle hatao, phir naya banao
# Trade-off: Update ke time thodi capacity kam hogi (acceptable)
```

**Cluster Autoscaler lagao (cloud pe):**
```bash
# AWS EKS mein:
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --set autoDiscovery.clusterName=shopwave-prod \
  --set awsRegion=ap-south-1 \
  -n kube-system

# Ab cluster automatically nodes add/remove karega!
```

---

## Incident 15: Init Container Failure — Service Won't Start

### 🔴 Alert
```
kubectl get pods -n shopwave:
NAME                    READY   STATUS     RESTARTS
user-service-abc        0/1     Init:0/1   0
user-service-def        0/1     Init:0/1   0
# Saari replicas stuck!
```

### 🔍 Investigation
```bash
# STEP 1: Init container kya hai?
kubectl describe pod user-service-abc -n shopwave | grep -A20 "Init Containers"
# Init Containers:
#   wait-for-postgres:
#     Image: busybox:1.28
#     Command: sh -c until pg_isready -h postgres-service -p 5432; do sleep 2; done
#     State: Running  ← Running but not completing

# STEP 2: Init container logs
kubectl logs user-service-abc -n shopwave -c wait-for-postgres
# postgres-service:5432 - no response
# postgres-service:5432 - no response
# postgres-service:5432 - no response
# Forever loop!

# STEP 3: Postgres service check karo
kubectl get svc postgres-service -n shopwave
# Error: services "postgres-service" not found!  ← Service hi nahi hai!

# STEP 4: Postgres pod chal raha hai?
kubectl get pods -n shopwave -l app=postgres
# No resources found.  ← StatefulSet bhi nahi hai!

# STEP 5: Apply order check karo
kubectl get events -n shopwave | grep -i postgres
# Normal  Created  ... "Deployment user-service created"
# (Postgres StatefulSet kabhi apply nahi hua!)
```

### 🔧 Fix
```bash
# STEP 1: Infrastructure pehle deploy karo (correct order!)
kubectl apply -f k8s/phase-3-storage/01-statefulsets.yaml

# STEP 2: Postgres ready hone ka wait karo
kubectl wait --for=condition=ready pod/postgres-0 -n shopwave --timeout=120s

# STEP 3: User service pod automatically retry karega
# Init container dobara check karega aur ab succeed karega
kubectl get pods -n shopwave -w
# user-service-abc   0/1   Init:0/1   → PodInitializing   → Running

# VERIFY:
kubectl logs user-service-abc -n shopwave -c wait-for-postgres
# postgres-service:5432 - accepting connections   ← 
```

**Deployment mein better init container:**
```yaml
# k8s/phase-1-foundations/03-deployments.yaml mein add karo
initContainers:
- name: wait-for-postgres
  image: postgres:16-alpine
  # pg_isready better tool hai busybox se
  command:
  - sh
  - -c
  - |
    until pg_isready -h postgres-service -p 5432 -U shopwave; do
      echo "Waiting for PostgreSQL..."
      sleep 3
    done
    echo "PostgreSQL is ready!"
  env:
  - name: PGPASSWORD
    valueFrom:
      secretKeyRef:
        name: shopwave-db-secret
        key: DB_PASSWORD
- name: wait-for-redis
  image: redis:7-alpine
  command:
  - sh
  - -c
  - |
    until redis-cli -h redis-service -p 6379 -a $REDIS_PASSWORD ping; do
      echo "Waiting for Redis..."
      sleep 3
    done
    echo "Redis is ready!"
  env:
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: shopwave-secrets
        key: REDIS_PASSWORD
```

---

## Incident 16: Certificate Expiry — HTTPS Down

### 🔴 Alert
```
Browser: NET::ERR_CERT_DATE_INVALID
curl:    SSL certificate problem: certificate has expired
Users:   "ShopWave open nahi ho raha!"
Impact:  100% HTTPS traffic down
```

### 🔍 Investigation
```bash
# STEP 1: Certificate status
kubectl get certificate -n shopwave
# NAME           READY   SECRET          AGE
# shopwave-tls   False   shopwave-tls    95d  ← Not Ready!

# STEP 2: Certificate describe
kubectl describe certificate shopwave-tls -n shopwave
# Status:
#   Conditions:
#     Message: Certificate is expired
#     Reason:  Expired
# Not After: 2024-10-14T00:00:00Z   ← Aaj expire hua!

# STEP 3: cert-manager pod check
kubectl get pods -n cert-manager
# cert-manager-xxx   1/1   Running   0   30d   ← Chal raha hai

# STEP 4: cert-manager logs
kubectl logs deployment/cert-manager -n cert-manager | tail -30
# E1014 09:00:01 Failed to renew certificate: rate limit exceeded
# E1014 09:00:31 Failed to renew certificate: rate limit exceeded
# Let's Encrypt rate limit hit!

# STEP 5: CertificateRequest history
kubectl get certificaterequest -n shopwave
# shopwave-tls-1   False   ...   ACME rate limit
# shopwave-tls-2   False   ...   ACME rate limit
# Let's Encrypt: 5 failed validations = 1 week ban!
```

### 🔧 Fix

**Immediate — Self-signed certificate (temporary):**
```bash
# TLS secret manually create karo self-signed cert se
openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
  -keyout /tmp/tls.key \
  -out /tmp/tls.crt \
  -subj "/CN=api.shopwave.com" \
  -addext "subjectAltName=DNS:api.shopwave.com"

# Secret update karo
kubectl create secret tls shopwave-tls \
  --key=/tmp/tls.key \
  --cert=/tmp/tls.crt \
  -n shopwave \
  --dry-run=client -o yaml | kubectl apply -f -

# Ingress ab self-signed cert use karega — browser warning aayega
# Lekin site accessible hogi!
```

**Permanent — cert-manager properly configure karo:**
```bash
# Staging issuer pehle test karo (rate limit nahi)
kubectl apply -f - << 'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: devops@shopwave.com
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
    - http01:
        ingress:
          class: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@shopwave.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Certificate manually renew karo
kubectl delete certificate shopwave-tls -n shopwave
kubectl apply -f k8s/phase-4-networking/01-ingress.yaml

# Status monitor karo
watch kubectl get certificate -n shopwave
# Kuch minutes mein READY: True hona chahiye
```

**Monitoring — 30 days pehle alert:**
```yaml
# k8s/phase-6-operations/monitoring.yaml mein add karo
- alert: CertificateExpiringSoon
  expr: |
    certmanager_certificate_expiration_timestamp_seconds
    - time() < 30 * 24 * 3600
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Certificate expiring in < 30 days: {{ $labels.name }}"
    description: "Take action NOW to avoid SSL outage"

- alert: CertificateExpired
  expr: certmanager_certificate_ready_status{condition="False"} == 1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Certificate is NOT READY: {{ $labels.name }}"
```

---

## Incident 17: Zombie Pods — Terminating Forever

### 🔴 Alert
```
kubectl get pods -n shopwave:
NAME                    STATUS        RESTARTS   AGE
order-service-old-abc   Terminating   0          2h
order-service-old-def   Terminating   0          2h
# 2 ghante se Terminating — complete nahi hua!
```

### 🔍 Investigation
```bash
# STEP 1: Pod describe karo
kubectl describe pod order-service-old-abc -n shopwave
# Conditions:
#   Ready: False
# Status: Terminating
# DeletionTimestamp: 2024-10-14T07:00:00Z   ← 2 ghante pehle delete signal

# STEP 2: Finalizers dekho — yeh sometimes pod ko rok dete hain
kubectl get pod order-service-old-abc -n shopwave -o json | \
  python3 -c "import json,sys; p=json.load(sys.stdin); print(p['metadata'].get('finalizers', []))"
# []   ← Koi finalizer nahi

# STEP 3: Container kill kyun nahi hua?
kubectl exec order-service-old-abc -n shopwave -- ps aux
# Error: container not found   ← Container toh gaya, pod state stuck hai

# STEP 4: Node status
kubectl get node $(kubectl get pod order-service-old-abc -n shopwave -o jsonpath='{.spec.nodeName}')
# NAME              STATUS     AGE
# shopwave-node-2   NotReady   2h   ← Node hi down hai!
# Node down hai toh kubelet SIGTERM nahi bhej sakta!

# STEP 5: Force delete safe hai? Stateless pods ke liye — haan!
# StatefulSet ke liye — CAREFULLY (data loss risk)
```

### 🔧 Fix
```bash
# OPTION 1: Node wapas aaye toh pods automatically cleanup hoga
# Wait karo ya node restart karo

# OPTION 2: Force delete (stateless pods ke liye safe)
kubectl delete pod order-service-old-abc order-service-old-def \
  -n shopwave --force --grace-period=0
# Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated
# Theek hai — yeh stuck pods hain, data loss risk nahi

# VERIFY: Gone!
kubectl get pods -n shopwave | grep Terminating
# (nothing)

# OPTION 3: Node recovery
kubectl cordon shopwave-node-2    # Naye pods mat bhejo
kubectl drain shopwave-node-2 --ignore-daemonsets --delete-emptydir-data  # Pods hatao
# Node fix karo (restart, etc.)
kubectl uncordon shopwave-node-2  # Wapas normal karo
```

---

## Master Debugging Decision Tree

```
Pod kharab hai? → kubectl get pods -n shopwave
      │
      ├── Pending?
      │       ├── kubectl describe pod → Events dekho
      │       ├── Resources? → kubectl top nodes
      │       ├── PVC? → kubectl get pvc
      │       └── Taints? → kubectl describe node
      │
      ├── CrashLoopBackOff?
      │       ├── kubectl logs pod --previous  ← SABSE PEHLE
      │       ├── Exit code 137? → OOMKilled → Memory badhaao
      │       ├── Exit code 1? → App crash → Code/Config check
      │       └── kubectl describe pod → Env vars missing?
      │
      ├── ImagePullBackOff?
      │       ├── Image name/tag sahi hai?
      │       ├── Private registry? imagePullSecret?
      │       └── kubectl describe pod → Events mein exact error
      │
      ├── OOMKilled?
      │       ├── kubectl describe pod → Exit Code: 137
      │       ├── kubectl top pods → Memory usage
      │       └── Limit badhaao ya leak fix karo
      │
      ├── Init:0/1?
      │       ├── kubectl logs pod -c init-container-name
      │       ├── Dependency service ready hai?
      │       └── NetworkPolicy blocking? DNS working?
      │
      ├── Terminating (stuck)?
      │       ├── Node status? NotReady → force delete OK
      │       ├── Finalizers? → manually remove
      │       └── kubectl delete pod --force --grace-period=0
      │
      └── Running but errors?
              ├── kubectl logs deployment/service-name
              ├── kubectl exec -it pod -- sh
              ├── Service endpoints? kubectl get endpoints
              └── NetworkPolicy? kubectl describe netpol
```
