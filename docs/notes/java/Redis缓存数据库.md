# Redis开发规范

## 键值设计

### key名设计

- (1)【建议】: 可读性和可管理性

以业务名(或数据库名)为前缀(防止key冲突)，用冒号分隔，比如业务名:表名:id

```
biz:table:1
```

- (2)【建议】：简洁性

保证语义的前提下，控制key的长度，当key较多时，内存占用也不容忽视，例如：

```
user:{uid}:friends:messages:{mid}简化为u:{uid}:fr:m:{mid}。
```

- (3)【强制】：不要包含特殊字符

反例：包含空格、换行、单双引号以及其他转义字符

### value设计

- (1)【强制】：拒绝bigkey(防止网卡流量、慢查询)

string类型控制在10KB以内，hash、list、set、zset元素个数不要超过5000。

反例：一个包含200万个元素的list。

非字符串的bigkey，不要使用del删除，使用hscan、sscan、zscan方式渐进式删除，同时要注意防止bigkey过期时间自动删除问题(例如一个200万的zset设置1小时过期，会触发del操作，造成阻塞，而且该操作不会不出现在慢查询中(latency可查))，查找方法和删除方法

- (2)【推荐】：选择适合的数据类型。

例如：实体类型(要合理控制和使用数据结构内存编码优化配置,例如ziplist，但也要注意节省内存和性能之间的平衡)

反例：

```
set user:1:name tom
set user:1:age 19
set user:1:favor football
```

正例:

```
hmset user:1 name tom age 19 favor football
```

### 控制key的生命周期

【推荐】：控制key的生命周期，redis不是垃圾桶。

建议使用expire设置过期时间(条件允许可以打散过期时间，防止集中过期)，不过期的数据重点关注idletime。

## 命令使用

### O(N)命令关注N的数量

【推荐】例如hgetall、lrange、smembers、zrange、sinter等并非不能使用，但是需要明确N的值。有遍历的需求可以使用hscan、sscan、zscan代替。

### 禁用命令

【推荐】禁止线上使用keys、flushall、flushdb等，通过redis的rename机制禁掉命令，或者使用scan的方式渐进式处理。

### 合理使用select

【推荐】redis的多数据库较弱，使用数字进行区分，很多客户端支持较差，同时多业务用多数据库实际还是单线程处理，会有干扰。

### 使用批量操作提高效率

【推荐】原生命令：例如mget、mset。

非原生命令：可以使用pipeline提高效率。

但要注意控制一次批量操作的元素个数(例如500以内，实际也和元素字节数有关)。

注意两者不同：

| 特性 | 原生批量操作 | pipeline |
|------|-------------|----------|
| 原子性 | 原子操作 | 非原子操作 |
| 命令类型 | 只能打包相同命令 | 可以打包不同的命令 |
| 支持要求 | 服务端支持即可 | 需要客户端和服务端同时支持 |

### Redis事务功能较弱，不建议过多使用

【建议】Redis的事务功能较弱(不支持回滚)，而且集群版本(自研和官方)要求一次事务操作的key必须在一个slot上(可以使用hashtag功能解决)

### Redis集群版本在使用Lua上有特殊要求

【建议】

- 1.所有key都应该由 KEYS 数组来传递，redis.call/pcall 里面调用的redis命令，key的位置，必须是KEYS array, 否则直接返回error，"-ERR bad lua script for redis cluster, all the keys that the script uses should be passed using the KEYS array"
- 2.所有key，必须在1个slot上，否则直接返回error, "-ERR eval/evalsha command keys must in same slot"

### 必要情况下使用monitor命令时，要注意不要长时间使用

【建议】

## 客户端使用

### 避免多个应用使用一个Redis实例

【推荐】

正例：不相干的业务拆分，公共数据做服务化。

### 使用带有连接池的数据库

【推荐】可以有效控制连接，同时提高效率，标准使用方式：

执行命令如下：

```java
Jedis jedis = null;
try {
    jedis = jedisPool.getResource();
    //具体的命令
    jedis.executeCommand()
} catch (Exception e) {
    logger.error("op key {} error: " + e.getMessage(), key, e);
} finally {
    //注意这里不是关闭连接，在JedisPool模式下，Jedis会被归还给资源池。
    if (jedis != null)
        jedis.close();
}
```

下面是JedisPool优化方法的文章:

- Jedis常见异常汇总
- JedisPool资源池优化

### 高并发下建议客户端添加熔断功能

【建议】(例如netflix hystrix)

### 设置合理的密码

【推荐】如有必要可以使用SSL加密访问（阿里云Redis支持）

### 根据自身业务类型，选好maxmemory-policy(最大内存淘汰策略)，设置好过期时间

【建议】

默认策略是volatile-lru，即超过最大内存后，在过期键中使用lru算法进行key的剔除，保证不过期数据不被删除，但是可能会出现OOM问题。

其他策略如下：

- allkeys-lru：根据LRU算法删除键，不管数据有没有设置超时属性，直到腾出足够空间为止。
- allkeys-random：随机删除所有键，直到腾出足够空间为止。
- volatile-random:随机删除过期键，直到腾出足够空间为止。
- volatile-ttl：根据键值对象的ttl属性，删除最近将要过期数据。如果没有，回退到noeviction策略。
- noeviction：不会剔除任何数据，拒绝所有写入操作并返回客户端错误信息"(error) OOM command not allowed when used memory"，此时Redis只响应读操作。

## 相关工具

### 数据同步

【推荐】redis间数据同步可以使用：redis-port

### big key搜索

【推荐】redis大key搜索工具

### 热点key寻找

【推荐】(内部实现使用monitor，所以建议短时间使用)

facebook的redis-faina

阿里云Redis已经在内核层面解决热点key问题，欢迎使用。

## 附录：删除bigkey

1. 下面操作可以使用pipeline加速。
2. redis 4.0已经支持key的异步删除，欢迎使用。

### Hash删除: hscan + hdel

```java
public void delBigHash(String host, int port, String password, String bigHashKey) {
    Jedis jedis = new Jedis(host, port);
    if (password != null && !"".equals(password)) {
        jedis.auth(password);
    }
    ScanParams scanParams = new ScanParams().count(100);
    String cursor = "0";
    do {
        ScanResult<Entry<String, String>> scanResult = jedis.hscan(bigHashKey, cursor, scanParams);
        List<Entry<String, String>> entryList = scanResult.getResult();
        if (entryList != null && !entryList.isEmpty()) {
            for (Entry<String, String> entry : entryList) {
                jedis.hdel(bigHashKey, entry.getKey());
            }
        }
        cursor = scanResult.getStringCursor();
    } while (!"0".equals(cursor));

    //删除bigkey
    jedis.del(bigHashKey);
}
```

### List删除: ltrim

```java
public void delBigList(String host, int port, String password, String bigListKey) {
    Jedis jedis = new Jedis(host, port);
    if (password != null && !"".equals(password)) {
        jedis.auth(password);
    }
    long llen = jedis.llen(bigListKey);
    int counter = 0;
    int left = 100;
    while (counter < llen) {
        //每次从左侧截掉100个
        jedis.ltrim(bigListKey, left, llen);
        counter += left;
    }
    //最终删除key
    jedis.del(bigListKey);
}
```

### Set删除: sscan + srem

```java
public void delBigSet(String host, int port, String password, String bigSetKey) {
    Jedis jedis = new Jedis(host, port);
    if (password != null && !"".equals(password)) {
        jedis.auth(password);
    }
    ScanParams scanParams = new ScanParams().count(100);
    String cursor = "0";
    do {
        ScanResult<String> scanResult = jedis.sscan(bigSetKey, cursor, scanParams);
        List<String> memberList = scanResult.getResult();
        if (memberList != null && !memberList.isEmpty()) {
            for (String member : memberList) {
                jedis.srem(bigSetKey, member);
            }
        }
        cursor = scanResult.getStringCursor();
    } while (!"0".equals(cursor));

    //删除bigkey
    jedis.del(bigSetKey);
}
```

### SortedSet删除: zscan + zrem

```java
public void delBigZset(String host, int port, String password, String bigZsetKey) {
    Jedis jedis = new Jedis(host, port);
    if (password != null && !"".equals(password)) {
        jedis.auth(password);
    }
    ScanParams scanParams = new ScanParams().count(100);
    String cursor = "0";
    do {
        ScanResult<Tuple> scanResult = jedis.zscan(bigZsetKey, cursor, scanParams);
        List<Tuple> tupleList = scanResult.getResult();
        if (tupleList != null && !tupleList.isEmpty()) {
            for (Tuple tuple : tupleList) {
                jedis.zrem(bigZsetKey, tuple.getElement());
            }
        }
        cursor = scanResult.getStringCursor();
    } while (!"0".equals(cursor));

    //删除bigkey
    jedis.del(bigZsetKey);
}
```

## Pipeline使用注意事项

为减少网络开销，当需要执行一批命令时，可以将多个命令放在pipeline中批量执行。pipeline并非原子命令，pipeline中每个命令是独立的，会出现部分成功部分失败的情况。pipeline里的多个request/response顺序是一一对应的。

【特别注意】

pipeline会出现部分结果成功，部分结果失败的情况，需要处理好这种场景。单机故障或其他原因会导致部分命令失败，请根据情况进行正确处理，尽量避免少量命令失败导致业务受损严重，具体见：【重要】【稳定性】pipeline支持单机超时提前返回部分结果。曾有至少3次严重事故和pipeline部分失败结果没有被处理好有关，其中一个是S1，具体见redis SLA详细说明及使用规范#pipeline相关事故：历史事故

pipeline里的request多数情况是顺序执行，但是并不能保证是按顺序执行的，有时部分命令暂时失败，proxy会加入重试队列进行重试，会打乱pipeline的顺序（这对可用性的提高是必要的）。如果需要保障同key的多个命令是严格有序执行，需要使用redis Lua用户文档

通过SetPipelineBatchNum配置合适的pipeline分拆大小。对于大pipeline（长度>100），客户端侧的默认行为是会拆分成多个子pipeline（长度<=100），同步串行发送给服务端。当服务端网络异常时，第一个子pipeline往往会用满整个超时时间，后续的子pipeline全部抛超时异常。可以在初始化客户端时通过SetPipelineBatchNum改变pipeline拆分长度。

单个子pipeline推荐配置：命令数<1000，写入数据<1MB，读取数据<5MB。

ConfigBuilder里的setPipelineTimeoutMs可以设置全局的超时时间，也通过可以用pipelined设置本次pipeline的超时时间，详细见：pipelined超时时间

当单机因为故障不能及时返回时，服务端默认会提前5ms返回给SDK侧（提前时间后续会基于网络延时调整），例如超时时间是50ms，此时业务层看到的pipeline实际延迟会变成45ms：超时部分返回机制说明

hgetall等命令在pipeline里不支持，详细见：不支持的命令

对于pipeline的重试需要谨慎，pipeline对redis服务端的压力比较大，超过1次重试很容易把redis集群打雪崩

大pipeline写对集群的负载压力远高于大pipeline读，请勿在大pipeline读失败后，进行同qps的大pipeline写，否则很容易造成雪崩

如果需要测试部分返回是否开发正确，可以联系redis同学进行故障注入测试

## redis架构

### Proxy

Proxy 无状态，通过注册中心注册服务；

Client 通过注册中心获取可用 proxy；

Proxy 通过元信息转发数据请求。

### 存储层

数据分槽（slot），多个连续的slot为一个逻辑组（partition），每个节点管理多个partiton副本，partitoin可以在节点间迁移；

主从模式，主副本通过复制机制向其他副本写入数据；

高可用，当主副本宕机时，可以迅速切主并转发流量。

全部组件运行在容器编排平台之上，实现资源动态伸缩。
