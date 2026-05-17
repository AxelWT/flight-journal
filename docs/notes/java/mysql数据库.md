---
title: "MySQL 开发规范"
date: 2026-05-10
description: MySQL DML/DDL 操作规范、索引设计与 SQL 优化最佳实践
tags:
  - Java
  - MySQL
  - 数据库
---

# MySQL开发规范

## DML/DDL操作规范

建表示范：

```
-- 避免使用timestamp来存储时间字段，除非业务依赖timestamp的某些特性,timestamp只能表示到2038年，而且在大量读取的情况下可能导致DB获取系统锁消耗大量cpu资源
```

https://opensource.actionsky.com/20191112-mysql/

https://zdg39.github.io/2019/12/22/online-failure-MySQL-timestamp/

```
-- 每张表包含5个公共字段，id,created_at,updated_at,is_deleted,sync_time,(region_shard_info,暂时不加)
--    id: innodb表必须强制加的物理主键；
--    is_deleted: 作为标识记录逻辑删除，非必须字段，枚举类型，0有效，1删除，默认为0(有效)，如数据量增长过大可通过归档，归档后在表中物理删除。
--    created_at: 字段作为增量数据同步拉取数据,归档和数据回退等场景下使用 # created_at 默认current_timestamp 或者1970-01-01 08:00:01
--    updated_at: 字段作为增量数据同步拉取数据,归档和数据回退等场景下使用 # updated_at 默认current_timestamp，on update  current_timestamp
--    sync_time: 作为多活场景下，数据同步进行region间数据校验使用，默认current_timestamp(3)，on update current_timestamp(3) # 暂时不强制添加
            `sync_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '预留字段，仅供数据同步校验使用',
--    region_shard_info: 日后多活预留使用 # 暂时不添加
    -- 示例:
    create table if not exists `example_service`(
        `id` bigint(20) unsigned not null auto_increment comment 'Primary Key ID',
           -- 业务字段，如果此列选择性高，请建索引，如字段是敏感字段，请在备注中增加#高密#部分
        `phone_num` bigint(20) not null default 0 comment 'Contact Information#High Security#',
        `is_deleted` tinyint(4) not null default 0 comment '0: In Use',

        -- 字段名称也可以用 gmt_create, gmt_modified
        -- 用datetime来存储时间
        -- 避免使用timestamp来存储时间字段，除非业务依赖timestamp的某些特性,timestamp只能表示到2038年，而且在大量读取的情况下可能导致DB获取系统锁消耗大量cpu资源
        `created_at` datetime not null default current_timestamp comment 'Creation Time',
           -- 毫秒可以用datetime(3),微秒datetime(6),更高精度可以选择bigint
        `updated_at` datetime not null default current_timestamp on update current_timestamp comment 'Modified Time',
           -- 毫秒可以用datetime(3),微秒datetime(6),更高精度可以选择bigint
        -- 如果需要纳秒精度可以用bigint来存储时间
        -- `created_at` bigint not null comment 'Creation Time',
        -- `updated_at` bigint not null comment 'Modified Time',
        primary key(`id`),
        key idx_created_at(created_at),   -- 要求有Creation Time字段为最左前缀的索引
        key idx_updated_at(updated_at)    -- 要求有Modified Time字段为最左前缀的索引
     ) engine=InnoDB default charset=utf8mb4 comment='Service Charging Rule Table';
```

## 命名规范

所有对象命名应该遵循下述原则：

### 可读性原则

### 表意性原则

## 存储引擎

默认innodb，非特殊要求一律使用innodb引擎

## 字符集

Database Server 字符集统一默认utf8mb4，table和column从server继承，如果有特殊字符或者生僻字，需要在创建数据库申请时特别说明字符集

## 表设计约定

### 主键

必须包含物理主键ID列

主键必须自增长(auto_increment)

强烈不建议业务中使用id列，要设计业务自己的唯一键，并建索引

主键类型为 int unsigned或 bigint unsigned；

例子: id bigint(20) unsigned not null auto_increment comment '主键id'

### 外键

数据库表禁止主外键关联，需要在程序业务逻辑中维护(特殊情况如跟支付，财务模块相关，方可考虑主外键)

### 表名，字段命名规则

需满足可读性，使用小写英文字符，如果是分表，可以前缀英文+_数字，如order_0，order_11

表名,字段名长度不要超过40个字符, MySQL内部限制为64个字符

例子：table name : tb_order_detail_xxx ;

column name: order_id,order_address;

### 公共字段（每个表必须包含的字段和索引）

### 字段冗余

非严格遵守3NF,通过业务字段冗余来减少表关联

### 字段类型长度选择

主键长度 默认bigint(20)

#### 字符串

varchar:存放可变长度字段，由1-2个字节记录，字符串长度小于等于255，只需要一个字节记录

char:存放定长字段，对于经常修改的字段比较有优势，存放非常短的列，例如:'Y','N'性能较好

尽可能使用定长char类型，如姓名，身份证号码，如需要变长varchar，尽可能根据实际情况限制长度，如description等

#### 整型

枚举类型建议使用tinyint(4)

tinyint(4),smallint(6),int(11),bigint(20) # 括号内的默认值，不建议修改

#### 日期

datetime 占8个字节，支持 '1000-01-01 00:00:00' 到 '9999-12-31 # 时间范围大，如自己维护的时间字段，建议选择

默认值非current_timestamp()下，建议默认值设置为'1970-01-01 08:00:01'

timestamp占4个字节，支持'1970-01-01 00:00:01'到 '2038-01-19 03:14:07'

UTC，建表时该字段不加任何属性时默认加非空约束，default值为current_timestamp，默认值非current_timestamp()下，建议设置成'19 70-01-01 08:00:01'

date类型,默认值非current_date()下，建议默认值为'1970-01-01'

一张表只能有一个timestamp列用于标识自动更新，长度不允许自定义，非自动更新的列建议统一使用datetime

#### 金额

建议使用decimal(xx,2)

#### 大字段

原则上不允许使用大字段(tinytext,mediumtext,logtext,tinyblob,mediumblob,longblob)，响应时间得不到保障;污染缓存;qps高时，会把宽带打满，不可控;

这种字段，尽可能的拆分成小字段，如果特别需要，建议选用其他存储方案(hbase,cassandra,其他 KV 存储或者对象存储)

### NULL与默认值

所有字段尽可能使用not null

整型默认值可为0

字符串默认值为''

时间默认值可为current_timestamp或 '1970-01-01 08:00:01'或对业务无影响的值

### 注释

建表包含表注释和字段注释，尤其字段是枚举类型需要说明每一种含义

### 大表标准

单表数据量不超过5kw，表大小不超过50G ，需要有归档(对于超过红线标准的表，需要设计成Sharding表) 参见sharding规则

建议：线上保留合理满足业务使用的数据生命周期，如3个月，半年，其他时间进行归档处理，如需保留作分析用，让大数据进行抽取存档

## 索引设计约定

### 索引原则

关联字段:有关联关系的表的字段，需要在关联字段上建索引，并确保类型一致

筛选字段:经常作为查询条件的筛选字段(where条件)，一般需要考虑建索引

排序分组字段:查询时经常作为排序(order by)或者分组(group by)的字段，应考虑创建索引

组合索引:频繁的查询进程使用某些固定的列，可以考虑为这些列创建一个组合索引(组合列不要超过三个)

筛选条件较好的字段(如:时间)应放在组合索引的最前面

索引并非越多越好，它会带来数据更新性能消耗和磁盘空间占用，原则上建议一个表的索引数量不要超过八个

筛选力度小的列，不建议创建索引(如:状态status字段，性别字段等)

组合索引，如果包含范围查询的和等值查询的情况，可根据值的可选择性高的等值查询的条件放前面，可选择性差的放第二以此类推，最后放范围查询条件的列

### 索引命名约定

主键:pk_columnName (或者让数据库自动命名)

唯一键:uk_columnName

普通索引:idx_columnName

组合索引:idx_column1_column2_Column3

### 聚簇索引(主键索引)约定

每张表都要指定物理主键(不指定MySQL会自动生成6位长度的字符伪列作为主键，长度长，效率低下[所有二级索引都会包含主键索引])，自增长，auto_increment

### 非聚集索引(二级索引)约定

查询条件经常用到a,b,c列，建立复合索引(a,b,c)

查询条件经常使用到b,c列，建立复合索引(b,c)

查询条件还要使用到c列，单独在c上建立索引

对超过20的不定长字符串，建议创建前缀索引add index(XXXX(20))

不建议在每个字段上都加索引（选择在选择性较高的列上创建索引）

### 检查冗余索引

#### 存量

工具：pt-duplicate-key-checker

DBA定期检查冗余索引，建议开发删除长期未使用的冗余索引，索引太多造成DML性能损耗和占用磁盘空间

#### 增量

工具：DDL 检测工具，用户提 ddl 工单时自动检测

两个索引定义在相同的字段，且字段顺序一致时，不区分唯一索引还是普通索引，则视为冗余索引；所以以下情况不视为冗余索引

已有一个索引定义在字段 (a,b) 上，新加一个索引定义在 a 上

已有一个索引定义在字段 (b,a) 上，新加一个索引定义在 a 上

已有一个索引定义在字段 (a) 上，新加一个索引定义在 (a,b) 上

已有一个索引定义在字段 (a) 上，新加一个索引定义在 (b,a) 上

## SQL约定

### 强制规定

- 禁止使用replace into操作
- 禁止使用"SELECT *"，必须使用列的列表;
- 禁止使用全文检索(Full Text Search)，有这种需求，数据量较少用LIKE,数据量较大用搜索引擎ES处理; 禁止在产品环境申请个人账号，只能申请业务使用的账号;
- 禁止使用:游标,触发器.自定义函数,存储过程,外键(请通过代码来保障逻辑)
- 禁止使用:Join关联查询,子查询
- 禁止在没有匹配索引的表上进行for update这类的操作，会锁定整个表; 未经过DBA同意，禁止在程序端大批量更新或者删除数据，因为这样操作很可能造成复制的大量阻塞和延时;
- 禁止在where后的筛选字段上做运算
- 禁止删除列操作
- 禁止大批量的查询数据结果，如果需要返回大量数据，请缩小单次获取数据的范围，循环多次查询获取
- 禁止在产品库进行大量统计类型的操作，这类操作应从大数据部门获取
- 禁止在数据库中使用全文索引
- 不使用 on duplicate key update
- 一条SQL语句中包含多个对象时，引用对象的列必须用"对象名.列名"或"对象别名.列名"的方式
- 每个列必须有注释，以便元数据的适用和程序的可维护性
- 谨慎 drop 和 truncate 相关表。
- 原则上禁止物理删除，要用is_deleted进行逻辑删除
- 业务不需要添加冗余字段备用，目前添加字段是比较平滑的，对业务无感知，可以在需要的时候添加（change column也会造成大数据抽数出问题）

### 性能约定

上线的SQL提交dba进行人工加规则review

关注慢查询和SQL的执行计划

给查询使用合适的索引，避免BAD SQL 导致线上事故

执行计划如有 using index condition/using intersect, using index condition 使用5.6 ICP特性，using intersect

说明该创建复合索引的地方创建了单列索引

每个逻辑表都需要有全局唯一健，单表会有primary，分库分表的表需要业务保证逻辑表有全局唯一字段

全局唯一健生成方案：分库分表建议创建数据全局唯一键，参考4.9 分布式ID生成器

离线Hive Ods天级快照表强依赖数据全局唯一键，否则无法创建天级快照表

表做拆分时，数据同步数据需要依赖全局唯一键同步数据

## 规范解释

### 字段NOT NULL

MySQL字段属性应该尽量设置为NOT NULL DEFAULT XXXX

除非你有一个很特别的原因去使用 NULL 值，你应该总是让你的字段保持 NOT NULL。

1、首先，我们要搞清楚空值("") 和 "NULL" 的概念：
    1）空值代表字符串长度为0,数据本身不占用实际存储空间的,长度需要1-2个字节
    2）MySQL中的NULL会在行记录头部占用空间(1个bit位)
2、其次，在数据库里是严格区分的，任何数跟NULL进行运算都是NULL, 判断值是否等于NULL，不能简单用=，而要用IS NULL关键字。
3、含有空值的列很难进行查询优化，而且对表索引时不会存储NULL值的，所以如果索引的字段可以为NULL，索引的效率会下降很多。因为它们使得索引、索引的统计信息以及比较运算更加复杂。你应该用0、一个特殊的值或者一个空串代替空值。
4、联表查询的时候，例如LEFT JOIN table2，若没有记录，则查找出的table2字段都是null。假如table2有些字段本身可以是null，那么除非把table2中not null的字段查出来，否则就难以区分到底是没有关联记录还是其他情况
5、数据库的字段col1设为NOT NULL, 仅仅说明该字段不能为NULL, 也就是说只有在
INSERT INTO table1(col1) VALUES(NULL);这种情况下数据库会报错
INSERT INTO table1(col1) VALUES(''); 不会报错。
（如果字段是自增ID，第一句不会报错，这不能说明是可以为NULL,而是 数据库系统会根据ID设的缺省值填充，或者如果是自增字段就自动加一等缺省操作。）

### 大量数据分批查询

如果需要返回大量数据，请缩小单次获取数据的范围，循环多次查询获取

比如，当查询条件是时间范围时，原来获取一天的数据（'2020-07-13' < x <= '2020-07-14'），数据量特别大，则可以改成每次获取一小时的数据（'2020-07-13 00:00:00' < x <= '2020-07-13 01:00:00'），分24次循环获取，则保证每次查询的结果集不会过大。

## 相关不规范问题汇总

| 不规范设计 | 建议写法/说明 |
| --- | --- |
| 单行太大 | 拆分不要单行太大 |
| 测试复现记录 | |
| 单表qps过打 | 单表的qps设计不要太高的qps |
| 某业务 dbDDL之后性能急剧下降问题总结2 | |
| `select * from employee` | `select id, name from employee;` |
| `select userId, name from user where userId like '%123'` | `select userId, name from user where userId like '123%'` |
| | 建议不要用like 非必须的情况下 %放到后面 |
| `select limit hugenum,offset` | 返回上次最大查询记录（偏移量） |
| | 偏移量特别大的时候，查询效率就变得低任务型扫表查询优化建议 |
| `Select Count(*) on table` | 缓存，减少频次等 |
| | 2020-08-20 数据库问题 |
| `Where func(key_col)=？` | `where key_col=？` 不要对应的索引进行函数 |
| `Where key_part2=? And key_part3=?` | `Where key_part1=? key_part2 =? And key_part3=?` |
| `Where key_part1>? And key_part2=?` | `Where key_part1=? And key_part2=?` |
| `select * from user where age-1 =10;` | `select * from user where age =11;` |
| | 应考虑在 where 及 order by 涉及的列上建立索引，尽量避免全表扫描。 |
| `SELECT DISTINCT * from user` | `select DISTINCT name from user;` |
| | 尽量少用 |
| `select a, b from table in (成千上万)` | `select a, b from table in (10个内)` |
| | in尽量少用 用的话也是少量的值 |

## 架构

### HA一致性（CAP理论）

HA一致性，即CAP理论，分布式系统最多只能同时满足一致性（Consistency）、可用性（Availability）和分区容错性（Partition tolerance）这三项中的两项

CA选项：切换优先保障数据一致性。

AP选项：切换优先保障服务可用性，暂不提供服务可用性时间选择。

注意事项(重要)：

1、注意此优先级别只作用于异常切换场景下，如主库由于宿主机网络导致异常，正常主备切换不受此级别影响，如预期内切换；

2、如选择AP选项：

(1)极端情况下DB切换会在尽量保证数据一致性的前提下，优先保证可用性，HA切换可能会有数据丢失（在故障宿主机数据盘不丢失的情况下，dba会提供差异的数据，业务上根据DBA提供的差异数据修复或者业务程序对账自助修复）；

(2)DB部署架构默认是本地高可用架构，即一主一备(与主同IDC，本地盘，半同步，HA备机)一灾备(与主跨IDC，云盘，异步，不参与HA，可强制切换)；

(3)高可用备库半同步允许自动降级为异步复制；

3、如选择CA选项：

(1)极端情况下DB切换优先保证数据一致性；数据不一致时，DB不可用时间会加长，具体不可用时间需根据实际情况评估；

(2)DB部署架构默认是跨AZ高可用架构，即一主二备(一个备机与主同IDC，本地盘，半同步，HA备机，另一个备机与主跨IDC，本地盘，半同步)一灾备(与主跨IDC，云盘，异步，不参与HA，可强制切换)，会比AP选项增加一个备机成本；金融级高可用架构成本更高，如需要了解配置和架构请联系业务dba；

(3)高可用备库半同步超时时间会设置成3600s，AP类型主实例半同步超时默认120S，部分场景如不修改类型仍需要保持数据一致性，请联系业务dba修改半同步超时时间。如果是金融级高可用架构，也需要修改半同步ack为2。

CAP理论是分布式系统设计中最基础也最重要的原则之一，它深刻地揭示了在构建分布式系统时必然要面对的核心权衡。下面这个表格能帮你快速抓住这三个属性的精髓和它们之间的根本矛盾。

| 特性 | 中文 | 简单理解 | 核心要求 |
| --- | --- | --- | --- |
| Consistency | 一致性 | 数据副本统一 | 所有节点在同一时间拥有相同的数据。一次写操作后，任何后续的读操作都必须返回最新值。 |
| Availability | 可用性 | 服务始终可响应 | 每一个非故障的节点发出的请求，都必须得到非错误响应（但不保证是最新数据）。 |
| Partition Tolerance | 分区容错性 | 系统容忍网络故障 | 当分布式系统中的节点之间由于网络问题导致通信中断（形成"分区"）时，系统整体仍然能够继续提供服务。 |

**核心矛盾与权衡**

CAP理论的核心结论是：在分布式系统中，C、A、P三者无法同时100%满足。当网络分区（P）不可避免地发生时，你必须在一致性（C）和可用性（A）之间做出艰难的选择。

你可以通过一个简单的场景来理解这个矛盾：假设一个分布式系统只有两个节点Node1和Node2，它们之间的网络突然中断（发生了P）。这时，一个客户端向Node1写入了一个新数据：

- **选择CP（放弃A）**：为了保证C（一致性），系统必须禁止客户端从Node2读取数据，因为Node2上的数据已经是旧的了。直到Node1和Node2之间的网络恢复并且数据同步完成后，Node2才能再次提供服务。在这个过程中，系统牺牲了可用性（Node2不可用），但保证了数据的一致性。

- **选择AP（放弃C）**：为了保证A（可用性），系统允许客户端从Node2读取数据，即使Node2上的数据是旧的。这样，系统牺牲了一致性（客户端读到了过期数据），但保证了每个请求都得到了响应。

- **选择CA（放弃P）**：这意味着你要假设网络分区永远不会发生。这在现实中通常不成立，尤其是对于跨地域的大型分布式系统。因此，CA系统实际上更偏向于非分布式或单数据中心的架构。

**实际应用与演变**

理解了核心矛盾后，我们来看看在实际设计中如何运用它。

- **P是分布式系统的基石**：由于网络本身是不可靠的，网络分区是必然会发生的情况。因此，在分布式系统设计中，分区容错性（P）是必须保证的。真正的权衡是在C和A之间进行的，这就是为什么你常听到"架构是AP还是CP"的说法。

- **常见的系统选择**：

    - **CP系统**：如传统的分布式数据库（HBase、Redis集群模式等）。它们将数据一致性作为首要目标，宁愿在出现故障时让部分节点暂时不可用，也要确保数据是正确的。

    - **AP系统**：如很多现代的互联网服务（电商商品库存显示、社交网络动态）。它们更看重服务的高可用性，允许数据在短时间内不一致，通过其他方式（如最终一致性）来弥补。

- **超越CAP：BASE理论**：为了突破CAP理论的严格限制，实践中衍生出了BASE理论作为AP架构的补充。它通过牺牲强一致性来获取高可用性，是构建高并发分布式系统的重要指导思想。

    - **基本可用**：系统在出现故障时，允许损失部分非核心功能的可用性，但核心功能必须保持可用。

    - **软状态**：允许系统中的数据存在中间状态，并且认为这个状态不会影响系统的整体可用性。

    - **最终一致性**：经过一段时间的同步后，所有数据副本最终能够达到一致的状态。这是对强一致性的弱化要求。

**总结**

CAP理论不是一个非此即彼的僵硬教条，而是一个指导我们进行权衡的框架。它的核心价值在于让我们清晰地认识到分布式系统设计的复杂性，并引导我们根据具体的业务场景做出最合适的选择。例如，对于转账、支付等金融业务，通常需要选择CP以保证数据的强一致性；而对于社交媒体的点赞数、新闻首页的展示等，选择AP以保证服务永远在线可能更为重要。

### MySQL QPS参考值

实例配置与可支撑 QPS 参考值，看看下面备注：

| 配置 | QPS SLA |
| --- | --- |
| 4核8G500G及以上 | 3600 |
| 4核16G500G及以上 | 9000 |
| 8核32G500G及以上 | 12500 |
| 16核64G500G及以上 | 18844 |

备注：

QPS 参考值，并不表示 MySQL 实例一定能跑到这个数值。

实例实际可支撑 QPS 取决于业务发送至数据库的实际操作语句的性能。

两个极端的例子：

1、根据主键等值查询某个 bigint 列数据，可支撑 QPS，可远超 QPS SLA 数值；

2、任何一条语句进到数据库就是一条慢查询，其可支撑 QPS，将远低于 QPS SLA 数值； #注：操作时间大于 100ms 的语句将进入慢查日志

做个假设：在不考虑其他消耗的情况下，1个连接，1秒内，针对第2种情况，能处理的请求个数最多为 10 个。

综述：业务请求越轻量，数据库可支撑 QPS 越高。

### Explain分析

| id | select_type | table | type | possible_keys | key | key_len | ref | rows | filtered | Extra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 显示本行是简单或复杂select。如果查询有任何复杂的子查询，则最外层标记为PRIMARY（DERIVED、UNION、UNION RESUlT） | 表名或表别名 | 访问类型，效率高低：const / eq_ref / ref / range / index / all | 考虑使用的索引 | 真实使用的索引 | 使用上索引的长度 | 用于索引查找的值的来源，如果值未常量，则 ref 为 const | 预计从查找的行数 | 查询条件所过滤的行记录数占比 | 1 Using filesort：非索引排序<br>2 Using temporary 临时表<br>3 Using index:索引覆盖<br>4 Using where :表明使用where过滤<br>...... |

**1 type列**

最优到最差分别为：system > const > eq_ref > ref > fulltext > ref_or_null > index_merge > unique_subquery > index_subquery > range > index > ALL

- system const 常量查询
- eq_ref 唯一索引
- ref 普通索引等值查询
- ref_or_nul 普通索引等值查询 允许null
- index_merge 索引合并 (索引合并的场景下 排序将可能无法使用上相关索引)
- range 索引的范围扫描
- index 索引覆盖 无需回表
- All 全表扫描

**2 possible_keys 列**

考虑使用的索引， 当大表(行数>500万)时 该处出现多个考虑索引 并且数据分布不均 则存在一定概况SQL会错误选择索引 从而导致性能雪崩

**3 key列**

当前查询 真实使用的索引

**4 key_len列**

使用上的索引长度 字节

- char(n)：n字节长度
- varchar(n)：2字节存储字符串长度，则长度 3n + 2
- tinyint：1字节
- smallint：2字节
- int：4字节
- bigint：8字节
- date：3字节
- timestamp：4字节
- datetime：8字节
- 如果字段允许为 NULL，需要额外增加1字节记录是否为 NULL

**5 rows列**

SQL可能要检索的数据行数 当扫描行数>10万 则可能会出现蛮查询，进一步导致性能雪崩

**6 filtered列**

索引的过滤性 它的值越大，表示索引过滤性越好；值越小，表示索引过滤性越差

**7 Extra列**

- Using temporary 创建一张临时表来处理查询结果 最好使用上索引来优化。这种类型常见于order by 和group by的查询中
- Using filesort：对查询结果进行外部索引排序而不是按索引次序从表里读取行，这种情况可以考虑建立索引来进行优化

### MySQL默认排序

慢查中，总是有各种 "order by col limit n" 无法用上索引，必须使用 filesort 的情况，通常来说，没有 "order by " 操作，就少了一层 cpu消耗，也少了一份内存消耗，查询语句整体效率会更快。有一种场景使用的是 "order by id asc limit n" ，优化的第一反应是，既然是按主键升序获取数据，是否可以 直接去掉 "order by " ？

前提： id是自增主键

1、order by id asc limit n， 数据一定按主键全局升序返回，不存在二义性；

2、仅有 limit n 时：

a. 若查询走的主键，则与 1 同

b. 若查询语句会且仅会使用一条固定的二级索引进行数据扫描，则其返回数据将根据获取的二级索引列升序展示（但若二级索引值相同，则再据主键id升序展示），则 limit n 每次查询的结果集相同（不考虑数据变化的情况）

c. 若查询语句执行计划有选择多条二级索引的可能，limit n 每次查询的结果集可能不同，因走的二级索引不同，其数据展示顺序也将发生变化

上述两种情况，均无法保证按 id 全局升序返回数据。

### 任务型扫表优化建议

前提：单表启用主键自增，且主键是业务不相关的。

1、根据你的查询条件，查询出满足这些查询条件的 min(id), max(id)；

2、在你的查询条件中，添加上 "id between M and N"。 建议 step=N-M 的步长，保持在 [1000,20000] 。

step 在代码中，可设置成一变量，在表中数据分布过于稀疏时，将step调大（此时 step 可适当大于 2W，保持在 10W 内）

注：此时，请将原始语句中的 "limit 1000" 或者 "limit 2700000,1000" 这种类型的关键词，从语句中去掉。

通常根据上述方式获取数据，一次查询，能在 1ms 内跑完（不是宽表）。

业务反正是轮询整张表，让每条语句都匀质的跑下去，时间可控，性能可控，对 DB 的影响可控，是个好习惯。

### OR和in list查询时间差异分析

生产中，能转换成 in list 查询的 OR 操作，建议尽量用 in list，或者等值，如果使用in的话建议in的数量越少越好，目前建议值不超过10.
