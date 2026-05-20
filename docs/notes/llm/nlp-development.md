---
title: NLP 发展全览
description: 从规则系统到 Transformer 大模型，自然语言处理的核心技术演进路线
tags:
  - nlp
  - deep-learning
  - transformer
  - sequence-model
  - pre-training
created: 2025-01-01
updated: 2025-05-01
---

# NLP 发展全览

## 1. NLP 历史

### NLP 是什么

自然语言处理（Natural Language Processing，NLP）是人工智能的重要分支，目标是让计算机理解、处理和生成自然语言。

### NLP 的发展历史

整个 NLP 发展是"机器理解语言能力不断增强"的过程。整体可以分为以下几个阶段：

| 阶段名称 | 时间范围 | 核心技术逻辑 |
|----------|----------|-------------|
| 规则式 NLP 时代 | 1950s-1980s | 人工规则驱动，依靠专家手动编写语法、匹配模板，计算机仅执行固定字符串匹配 |
| 统计式 NLP 时代 | 1990s-2010s | 统计机器学习范式，基于海量语料统计字词概率与共现规律，用概率模型处理文本 |
| 深度学习序列模型时代 | 2010s-2017 | 端到端神经网络建模，迭代出 RNN → LSTM/GRU → Seq2Seq → Attention 体系，实现长文本建模与序列生成 |
| Transformer 与预训练大模型时代 | 2017 - 至今 | 纯注意力机制替代循环结构，进入「预训练 + 微调」通用范式，实现全场景语言理解与生成能力 |

## 2. 文本表示

### 分词（文本切分）

核心目标：把一整段文本拆成模型能处理的「基本单元」，是 NLP 的第一步。

- **词级分词**：直接按空格、标点切分，比如 `I love NLP` → `[I, love, NLP]`，简单但容易遇到生僻词、复合词问题。
- **字符级分词**：直接按字母切分，比如 `cat` → `[c, a, t]`，不怕新词，但会丢失单词的整体语义。
- **子词级分词（主流）**：把词拆成常见词根/片段，比如 `unhappiness` → `un + happiness`，兼顾了词级和字符级的优点，既处理新词，又保留语义，是 BERT、GPT 这类模型的标配。

### 词表示

把自然语言里的「词」转换成计算机能处理的数字形式，是 NLP 所有算法的基础。

**概述**

- 目的：把离散的词语，映射成向量形式，方便后续模型计算。
- 演进路线：One-hot 编码 → 语义化词向量（Word2Vec） → 上下文相关词表示（如词嵌入、预训练模型）。

#### One-hot 编码

- 原理：给每个词分配一个维度等于词典大小的向量，词在词典中对应位置设为 1，其余全为 0。
- 优点：简单直接，实现无门槛。
- 缺点：
  a. 向量稀疏、维度极高（词典越大，向量越长），计算低效。
  b. 完全不包含语义信息，词与词之间无法体现"相似性"（比如"猫"和"狗"的向量毫无关联）。

#### 语义化词向量（Word2Vec）

- 核心目标：把词转成低维稠密向量，让语义相近的词，向量也相近。
- 核心思想：词的含义由上下文决定（"词以类聚"）。
- 两种训练方式：
  - **CBOW**：用上下文词预测中心词
  - **Skip-gram**：用中心词预测上下文词
- 优势：解决了 One-hot 的稀疏性问题，自带语义信息，可直接用于后续模型。
- 局限：一词一向量，无法区分多义词（比如"苹果"的水果/品牌两种含义，向量是同一个）。

#### 上下文相关词表示

- Word2Vec 的缺陷：同一个词在不同句子里，向量是固定的，无法区分多义词。
- 后续发展：ELMo、BERT 等模型，会根据词在句子里的上下文，动态生成词向量，解决多义词问题。

## 3. 深度学习基础

### 从函数到神经网络

事实上函数就是一种变换，对数据进行变换得到我们所需要的结果。

早期的人工智能→符号主义，即用精确的函数来表示一切。但是很多时候，我们没办法找到一个精确的函数来描述某个关系，退而求其次选择一个近似解也不错，也就是说函数没必要精确地通过每一个点，它只需要最接近结果就好了，这就是联结主义。

但是当数据呈现非线性关系时（比如曲线分布），简单的线性函数就没办法解决这个问题了。我们需要引入**激活函数**来为模型注入非线性表达能力，比如 ReLU、Sigmoid、Tanh 等。通过在每次线性变换后套入激活函数，多层叠加后神经网络就可以逼近任意复杂的连续函数。

![激活函数](/images/llm-development/激活函数.jpg)

这还不够，正常情况下我们不会只有一个输入，并且只有一个激活函数可能不会达到理想的结果，所以开始嵌套！

像这样多个输入，激活函数外面加一次线性变换，再套一个激活函数，并且还可以不断嵌套。通过这样的方式，我们可以构造出非常复杂的关系，理论上可以逼近任意的连续函数。

为了清晰表达这种结构，我们引入**神经元**的概念：每个圆圈代表一个神经元，线性变换 + 激活函数构成其计算过程，多个神经元互相连接形成的网状结构就叫做**神经网络**。随着函数式子的嵌套，神经网络也在拓展，原本的输出层成为了**隐藏层**：位于输入层和输出层之间的中间层，负责对输入数据进行复杂的特征提取和变换。

![神经元](/images/llm-development/神经元.jpg)

从结构上看，数据就像是一个信号从左向右逐层传播，这个过程就叫做神经网络的**前向传播**。神经网络的层数和每一层的神经元数量都可以叠加，构成一个非常复杂的非线性函数。但核心目标始终不变：找到近似解，也就是根据已知的 x、y 学习出所有权重 w 和偏置 b。

![前向传播](/images/llm-development/前向传播.jpg)

### 如何计算神经网络的参数

那么如何计算 w 和 b 呢？首先明确我们需要的 w 和 b 能够让函数的结果更接近真实数据。

![拟合](/images/llm-development/拟合.jpg)

用预测值减去真实值，再套上绝对值，就可以表示一个点的预测数据和真实值的误差。为了评估整体的拟合效果，我们将所有样本的误差累加起来，这样就得到了预测数据与真实数据的总的差异。这个函数就叫做**损失函数**：表示预测数据与真实数据误差的函数。去掉绝对值改为平方，再根据样本数量进行平均化，就得到了**均方误差**（MSE，Mean Squared Error）。把损失函数记为 L，从参数的视角看，L 就是一个关于 w、b 的函数。

损失函数表示的是预测值与真实值的误差，而我们的目标就是让误差最小，也就是可以让损失函数 L 最小的 w 和 b。

![损失函数](/images/llm-development/损失函数.jpg)

我们要让模型预测值 `y_pred` 尽量贴近真实值 `y_true`，用损失函数（Loss）衡量差距：

```
L = (y_pred - y_true)²
```

目标：最小化 Loss，让预测越来越准。

模型里的参数 w 会影响 y_pred，**梯度下降**就是通过调整 w，一步步把 Loss 降到最低。

#### 核心概念：导数（梯度）

导数 ∂L/∂w 的本质：当 w 变一点点时，Loss 会往哪个方向变、变多快。它只传递两个关键信息：
- **方向**：w 该变大还是变小，才能让 Loss 降低？
- **大小**：当前 Loss 曲线的"坡有多陡"，决定了调整的幅度。

#### 两种情况的直观理解

1. 情况 A：导数 ∂L/∂w > 0
   - 含义：w 变大 → L 变大；w 变小 → L 变小
   - 结论：要让 Loss 变小，w 必须减小
2. 情况 B：导数 ∂L/∂w < 0
   - 含义：w 变大 → L 变小；w 变小 → L 变大
   - 结论：要让 Loss 变小，w 必须增大

#### 梯度下降更新公式与关键要素

公式：
```
W_new = W_old - η · ∂L/∂w
```

- w：模型当前的权重参数
- η（学习率）：每次调整的"步子大小"。太大则一步跨过头，Loss 震荡不收敛；太小则训练速度极慢，迟迟达不到最优
- ∂L/∂w：梯度，告诉我们调整的方向和坡度
- 减号：保证参数永远往让 Loss 下降的方向更新

#### 完整流程示例（线性回归）

假设：`y_true = 10`，模型 `y_pred = w · x`，初始 `w = 2`，输入 `x = 4`，学习率 `η = 0.01`

1. 算预测：`y_pred = 2 × 4 = 8`
2. 算 Loss：`L = (8 - 10)² = 4`
3. 算梯度：`∂L/∂w = 2(wx - y_true) · x = 2 × (8 - 10) × 4 = -16`
4. 更新 w：`w_new = 2 - 0.01 × (-16) = 2.16`
5. 验证效果：新的 `y_pred = 2.16 × 4 = 8.64`，新 Loss `L = (8.64 - 10)² ≈ 1.8496`，Loss 确实下降了。

#### 梯度下降闭环流程

1. **前向传播**：计算模型预测值 y_pred
2. **计算 Loss**：衡量预测与真实值的差距
3. **反向求导**：计算梯度 ∂L/∂w，找到参数调整方向
4. **更新参数**：用公式 `w = w - η · ∂L/∂w` 更新权重
5. **循环迭代**：重复以上步骤，直到 Loss 不再明显下降

#### 代码实现

**不继承 nn.Module 的线性回归（手动版）**

```python
import torch

# 1. 数据
x_data = torch.tensor([1.0, 2.0, 3.0])
y_data = torch.tensor([2.0, 4.0, 6.0])

# 2. 初始化权重
w = torch.tensor([1.0], requires_grad=True)


# 前向传播
def forward(x):
    return x * w


# 损失函数
def loss(x, y):
    y_pred = forward(x)
    return (y_pred - y) ** 2


# 3. 训练
print("预测（训练前） x=4:", forward(4).item())

for epoch in range(100):
    for x, y in zip(x_data, y_data):
        l = loss(x, y)            # 前向
        l.backward()              # 反向求梯度
        w.data = w.data - 0.01 * w.grad.data  # 手动更新权重
        w.grad.data.zero_()       # 梯度清零

print("预测（训练后） x=4:", forward(4).item())
print("w =", w.item())
```

**继承 nn.Module 的标准 PyTorch 代码（推荐）**

```python
import torch


# 1. 数据（mini-batch 格式）
x_data = torch.tensor([[1.0], [2.0], [3.0]])
y_data = torch.tensor([[2.0], [4.0], [6.0]])


# 2. 定义模型（继承 nn.Module）
class LinearModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = torch.nn.Linear(1, 1)  # 自带 w 和 b，输入1维 → 输出1维

    def forward(self, x):
        return self.linear(x)


# 3. 创建模型对象
model = LinearModel()

# 4. 定义损失函数 & 优化器
criterion = torch.nn.MSELoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

# 5. 训练循环
for epoch in range(100):
    y_pred = model(x_data)
    loss = criterion(y_pred, y_data)

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    w = model.linear.weight.item()
    b = model.linear.bias.item()
    print(f"轮次 [{epoch + 1}/100] | w = {w:.6f} | b = {b:.6f} | loss = {loss.item():.6f}")

# 6. 测试结果
print("-" * 60)
print("训练完成！")
print(f"最终 w = {model.linear.weight.item():.6f}")
print(f"最终 b = {model.linear.bias.item():.6f}")

x_test = torch.tensor([[4.0]])
print(f"x=4 预测值 = {model(x_test).item():.4f}")
```

## 4.卷积神经网络（CNN）

下图是全连接神经网络（MLP），可以发现每一个节点都和前一层的所有节点相连接，这个并非神经网络所必需的，而这种连接方式叫做**全连接**。全连接层有一个显而易见的缺点：输入 900 个像素（如 30×30 图像），在一个全连接层之后就需要约 90 万个参数，并且这还只是把图像平铺开，不包含每个像素之间的位置关系。如果图片稍微平移或发生局部变化，所有神经元的输出都会改变，模型无法很好的理解图像的局部模式。

![cnn介绍示例](/images/llm-development/cnn介绍示例.jpg)

#### CNN 的核心概念

- **Channel** = 特征的"种类"。在图像里：通道 = 颜色维度（R、G、B）；在 CNN 里：通道 = 提取到的特征种类（边缘、纹理、角点、轮廓……）。可以理解成一张图有多少"层信息"。

![cnn原理](/images/llm-development/cnn原理.jpg)

CNN 做图像任务（比如手写数字识别），本质上就是两大步：

1. **特征提取（Feature Extraction）**：通过卷积 + 池化，自动从图片里提取关键特征（比如边缘、纹理、形状）
2. **分类（Classification）**：把提取到的特征喂给全连接层，输出最终的分类结果（比如数字 0-9）

#### 阶段 1：特征提取的核心组件

**1. 卷积层（Convolution Layer）**

这是 CNN 的灵魂，用来"抓特征"：
- 图片是多通道的（比如彩色图是 RGB 3 个通道，手写数字是 1 个灰度通道）
- 用一个小的卷积核（filter，比如 5×5）在图片上滑动，做加权求和，再加上偏置，得到新的特征图（Feature Map）
- 一个卷积层可以有多个卷积核，每个核负责抓一种特征（比如有的抓边缘，有的抓纹理），所以输出的通道数会变多

![cnn卷积](/images/llm-development/cnn卷积.jpg)

例：输入是 1×28×28 的手写数字（1 个通道，28×28 像素），经过第一个 5×5 卷积层，输出 4×24×24：4 个通道，说明有 4 个卷积核，特征图尺寸因为卷积核滑动变小了。

![cnn卷积多通道](/images/llm-development/cnn卷积多通道.jpg)

**2. 池化层（Pooling Layer / Subsampling）**

池化层的作用是**降维 + 保特征**，是卷积层的"好搭档"：
- 用一个小窗口（比如 2×2）在特征图上滑动，取窗口里的最大值（最大池化）或平均值（平均池化）
- 作用有两个：
  a. 缩小特征图尺寸，减少计算量和参数
  b. 保留关键特征，同时让模型对位置变化不敏感（比如数字稍微歪一点也能认出来）

例：4×24×24 的特征图，经过 2×2 池化，变成 4×12×12，宽高直接减半，通道数不变。

![cnn卷积和池化](/images/llm-development/cnn卷积和池化.jpg)

**3. 卷积 + 池化的叠加流程**

一个完整的示例流程：

1. 输入：`(batch, 1, 28, 28)`（一批图片，1 个通道，28×28 像素）
2. **Conv2d 层（C1）**：5×5 卷积核，输入通道 1，输出通道 10 → 输出 `(batch, 10, 24, 24)`（尺寸变化：28 - 5 + 1 = 24）
3. **Pooling 层（S1）**：2×2 池化 → 输出 `(batch, 10, 12, 12)`（尺寸变化：24 / 2 = 12）
4. **Conv2d 层（C2）**：5×5 卷积核，输入通道 10，输出通道 20 → 输出 `(batch, 20, 8, 8)`（尺寸变化：12 - 5 + 1 = 8）
5. **Pooling 层（S2）**：2×2 池化 → 输出 `(batch, 20, 4, 4)`（尺寸变化：8 / 2 = 4）

经过卷积-池化-卷积-池化，原始图片被转换成 20×4×4 的高维特征向量，完成特征提取。

为什么是 28 - 5？想象你手里有一排硬币，总共 28 个。你手里拿着一个框（卷积核），这个框刚好能盖住 5 个硬币。第一次盖住： 你把框按在最左边，占用了第 1 到第 5 个硬币。接下来能走多远？ 此时，框的右边界已经到了第 5 个硬币。从第 5 个硬币到最后一个（第 28 个）硬币，后面还剩下多少空间可以让你往右移动？剩下可移动的空间 = $28 - 5 = 23$ 个硬币。也就是说，你的框最多只能向右挪动 23 步，再挪框就要出界了。
为什么还要 + 1？因为你最开始还没开始挪动的时候，就已经站在第一个位置上了！

输入明明只有 1 个通道（黑白图），怎么一眨眼就变出了 10 个通道？ 它是无中生有吗？
其实，答案非常简单：因为你一口气雇佣了 10 个不同的“侦探”（卷积核）！ 大白话解释就是：1 张照片，交给了 10 个人，每个人用不同的眼光去观察，最后交上来了 10 张不同的“调查报告”。

池化（Pooling），大白话来说就是“抓大放小”或者“降采样/缩略图”。

如果说卷积是在帮你“找特征”，那池化就是在帮你“压缩体积，只留精华”。
假设输入是卷积切好的 (batch, 10, 24, 24) 的汉堡包，经过 2×2 池化 变成了 (batch, 10, 12, 12)。我们来看看它是怎么神不知鬼不觉地把尺寸切掉一半的。

池化是怎么操作的？（以最常用的 最大池化 Max Pooling 为例）
池化的规则通常非常粗暴。2×2 池化 意味着：把画面划分成无数个 2×2 的小方格，每个小方格的 4 个数字里，只挑一个最明显的（通常是最大的）留下，剩下 3 个直接扔掉！

#### 阶段 2：分类（全连接层）

当特征提取完成后，需要把多维的特征图转换成最终的分类结果：
1. **展平（Flatten）**：把 `(batch, 20, 4, 4)` 的特征图拉成一维向量（20 × 4 × 4 = 320），变成 `(batch, 320)`
2. **全连接层**：就像普通神经网络一样，把所有神经元连接起来，经过线性变换 + 激活函数，输出最终的类别概率。输入 320 个神经元，输出 10 个神经元（对应 0-9 十个数字）。

## 5. 循环神经网络（RNN）

### RNN 为什么会出现？

全连接网络、CNN 都有致命短板：
- **全连接网络**：只能处理独立无关的数据，没有记忆能力，前后输入互不影响。
- **CNN**：擅长网格结构、空间特征（图片），只看局部空间，不关注时间顺序、前后依赖。

但现实大量数据是时序序列：文本、语音、时间序列股票、翻译、对话、语音转文字，这些都有先后顺序、上下文依赖。比如："我今天没带伞，被___淋湿了"——正常人都知道填"雨"，因为要看前面上下文。全连接、CNN 都看不懂顺序、记不住前文，处理不了这类时序任务，所以 RNN 诞生。

为了处理有序的序列数据，引入记忆/上下文依赖，能把前面的信息带到后面计算。

### 序列模型的基础结构

RNN（循环神经网络）的核心结构是一个具有循环连接的隐藏层，它以时间步（time step）为单位，依次处理输入序列中的每个 token。

在每个时间步，RNN 接收当前 token 的向量和上一个时间步的隐藏状态（即隐藏层的输出），计算并生成新的隐藏状态，并将其传递到下一时间步。

![rnn结构](/images/llm-development/rnn结构.jpg)

1. 第 1 步（x1）：输入第一个词，得到隐藏状态 h1（第一步的"记忆"）

![rnn步骤1](/images/llm-development/rnn步骤1.jpg)

2. 第 2 步（x2）：输入第二个词，同时接收上一步的记忆 h1，计算出新的隐藏状态 h2（此时 h2 已包含 x1 和 x2 的信息）

![rnn步骤2](/images/llm-development/rnn步骤2.jpg)

3. 第 3 步（x3）：用 x3 和 h2 得到 h3，记忆继续向后传递

4. 第 4 步（x4）：用 x4 和 h3 得到 h4，最后由 h4 输出最终结果

![rnn步骤3计算细节](/images/llm-development/rnn步骤3计算细节.jpg)

**核心公式**（每个时间步 t）：
```
h_t = tanh(W·[h_{t-1}, x_t] + b)
```
- 输入：当前输入 x_t + 上一步的隐藏状态 h_{t-1}
- 输出：当前隐藏状态 h_t（包含了 x1 到 x_t 的所有信息）

### 多层结构

为了让模型捕捉更复杂的语言特征，可以将多个 RNN 层按层次堆叠起来，使不同层学习不同层次的语义信息。核心假设：底层网络更容易捕捉局部模式（如词组、短语），而高层网络则能学习更抽象的语义信息（如句子主题或语境）。

多层 RNN 结构中，每一层的输出序列会作为下一层的输入序列，最底层 RNN 接收原始输入序列，顶层 RNN 的输出作为最终结果。

![rnn结构多层](/images/llm-development/rnn结构多层.jpg)

### RNN 存在的问题

尽管 RNN 在处理序列数据方面具有天然优势，但它在实际应用中面临一个非常严重的问题：**长期依赖建模困难**。在训练过程中，当输入序列很长时，模型难以有效学习早期输入对最终输出的影响。

根本原因在于训练过程中存在的**梯度消失或梯度爆炸**问题。在训练 RNN 时，采用的是时间反向传播（Backpropagation Through Time, BPTT），梯度需要在每个时间步上不断链式传递，导致早期时间步的梯度在传递过程中逐渐消失（梯度消失）或指数增长（梯度爆炸）。

![rnn训练流程](/images/llm-development/rnn训练流程.jpg)

### LSTM / GRU

#### 概述

为了缓解 RNN 梯度消失或梯度爆炸的问题，1997 年提出了**长短期记忆网络**（Long Short-Term Memory, LSTM），用于增强模型的长期记忆能力。

#### LSTM（Long Short-Term Memory）

LSTM 本质上仍然属于 RNN，但相比普通 RNN，它增加了一套**记忆控制机制**。

**1. LSTM 核心结构**

LSTM 内部包含：
- Cell State（长期记忆通道）
- Hidden State（当前状态）
- 门控结构（Gate）

其中，Cell State 是 LSTM 最核心的设计。它像一条长期记忆通道，可以让重要信息在长序列中持续传递。

**2. 三个门结构**

- **遗忘门（Forget Gate）**：决定历史信息保留多少。例：当前内容已经与天气无关，模型可以忘掉天气信息。
- **输入门（Input Gate）**：决定当前信息写入多少。例："小明"是重要人物，模型会加强记忆。
- **输出门（Output Gate）**：决定当前输出哪些信息。并不是所有记忆都会直接输出，模型会根据当前任务选择输出部分内容。

**3. LSTM 的特点**

相比 RNN，LSTM 能够更好地保留长期信息，缓解梯度消失，提升长文本处理能力。在 Transformer 出现之前，LSTM 是 NLP 中最主流的序列模型，广泛用于机器翻译、文本生成、语音识别。

#### GRU（Gated Recurrent Unit）

略 / 可自行查阅资料了解

#### LSTM/GRU 的问题

虽然 LSTM 与 GRU 已显著提升了序列建模能力，但它们仍存在几个问题：

1. **无法并行计算**：LSTM/GRU 仍然属于时序递归结构，必须按顺序计算（x1 → x2 → x3 → x4），训练速度较慢。
2. **长文本仍然存在信息衰减**：面对超长文章、长对话、长代码，依然会出现长距离信息丢失。
3. **难以直接建模全局关系**：LSTM 更擅长局部时序关系，不擅长全局依赖关系。

因此，NLP 下一阶段开始进入 Attention 与 Transformer 时代。

## 6. 生成式 NLP

### 序列到序列（Seq2Seq）

#### 概述

传统的自然语言处理任务（如文本分类、序列标注）以静态输出为主，目标是预测固定类别或标签。然而，现实中许多应用需要模型动态生成新的序列，例如：
- **机器翻译**：输入中文句子，输出对应的英文翻译
- **文本摘要**：输入长篇文章，生成简短的摘要
- **对话系统**：输入对话历史，生成连贯的下一条回复

这些任务具有两个关键共同点：
- 输入和输出均为序列（如词、字符或子词序列）
- 输入与输出序列长度动态可变

为了解决这类问题，研究者提出了 **Seq2Seq** 模型。

#### 模型结构

Seq2Seq 模型由一个**编码器**（Encoder）和一个**解码器**（Decoder）构成。编码器负责提取输入序列的语义信息，并将其压缩为一个固定长度的上下文向量（Context Vector）；解码器则基于该向量，逐步生成目标序列。

**编码器**

编码器主要由一个循环神经网络（RNN/LSTM/GRU）构成，任务是将输入序列的语义信息提取并压缩为一个上下文向量。循环神经网络会依次接收每个 token 的输入，并在每个时间步更新隐藏状态。随着序列推进，信息不断累积，最终在最后一个时间步形成一个包含整句信息的隐藏状态，即上下文向量，传递给解码器。

![编码器](/images/llm-development/编码器.jpg)

**解码器**

解码器也主要由一个循环神经网络构成，任务是基于编码器传递的上下文向量，逐步生成目标序列。

- 生成开始时，以上下文向量作为初始隐藏状态，接收起始标记 `<sos>`（start of sentence）作为第一个时间步的输入
- 每个时间步根据前一时刻的隐藏状态和上一步生成的 token，预测当前输出
- 这种"将前一步的输出作为下一步输入"的方式称为**自回归生成**（Autoregressive Generation）
- 生成持续到模型生成结束标记 `<eos>`（end of sentence）

![解码器](/images/llm-development/解码器.jpg)

#### 模型训练和推理

**模型训练**

以中-英机器翻译为例：
- 中文输入："我喜欢你。"
- 英文输出："I like you."

1. **数据准备**：在目标句前添加 `<sos>`，句末添加 `<eos>` → `"<sos> I like you. <eos>"`
2. **前向传播**：编码器将源语言序列编码为上下文向量；解码器基于该向量逐步生成目标序列
3. **Teacher Forcing**：训练时，解码器每一步的输入是目标序列中真实的前一个 token（而非自己的预测），这样训练更快、误差不会累积、梯度传播更稳定

![解码器teacher-forcing](/images/llm-development/解码器teacher-forcing.jpg)
4. **计算损失**：解码器每一步输出 token 的概率分布，通过交叉熵损失衡量预测质量

![解码器计算损失](/images/llm-development/解码器计算损失.jpg)
5. **反向传播**：调用 `loss.backward()` 自动完成梯度反向传播

**模型推理**

1. **编码器处理**：与训练时完全一致，输入序列经分词、嵌入和 RNN 处理，生成上下文向量
2. **解码器处理**：采用自回归生成，每一步的输出作为下一步的输入，逐步构造完整句子

#### Seq2Seq 存在的问题

编码器将整个源句压缩为一个固定长度的上下文向量，存在两个核心问题：

1. **信息压缩困难**：用一个定长向量表达任意复杂的句子非常困难，长句信息易丢失。
2. **缺乏动态感知**：解码器始终基于同一个上下文向量生成，但不同位置的目标词往往依赖源句中不同的关键信息。

### Attention

#### 概述

解码器在生成目标序列的每一步时，不再依赖于一个静态的上下文向量，而是根据当前的解码状态，动态地从编码器各时间步的隐藏状态中选取最相关的信息。这种机制赋予模型**对齐**能力，使其能够自动判断源句中哪些位置对当前的目标词更为重要，从而有效缓解信息瓶颈问题。

![attention原理](/images/llm-development/attention原理.jpg)

#### 工作原理

注意力机制通过以下 4 个步骤实现：

1. **相关性计算**：解码器计算当前时间步的隐藏状态与编码器各时间步输出之间的相关性（注意力评分）。

![attention相关性计算](/images/llm-development/attention相关性计算.jpg)

2. **注意力权重计算**：使用 Softmax 将评分归一化为概率分布，得分越高的位置对应权重越大。

![attention权重计算](/images/llm-development/attention权重计算.jpg)

3. **上下文向量计算**：将编码器输出按注意力权重加权求和，得到当前步所需的上下文向量。

![attention上下文向量计算](/images/llm-development/attention上下文向量计算.jpg)

4. **解码信息融合**：将上下文向量与当前时间步的隐藏状态拼接，通过线性变换和 Softmax 生成目标词的概率分布。

![解码器信息融合](/images/llm-development/解码器信息融合.jpg)

#### 存在的问题

尽管注意力机制极大地增强了 Seq2Seq 的建模能力，但由于核心仍依赖 RNN 结构，仍面临两个根本性问题：

1. **计算过程无法并行**：RNN 时间步之间存在强依赖，必须顺序执行。
2. **长期依赖问题仍未根除**：对于超长序列，训练中仍可能出现梯度消失。

## 7. Transformer

### 概述

此前的 Seq2Seq 模型通过注意力机制取得了一定提升，但由于整体结构仍依赖 RNN，依然存在计算效率低、难以建模长距离依赖等结构性限制。

为了解决这些问题，Google 在 2017 年发表论文《Attention Is All You Need》，提出了**Transformer**。该模型完全摒弃了 RNN 结构，转而使用注意力机制直接建模序列中各位置之间的关系，显著提升了训练效率，并增强了对长距离依赖的建模能力。

![transformer架构](/images/llm-development/transformer架构.jpg)

### 核心思想

注意力机制突破了传统 Seq2Seq 的信息瓶颈，通过显式建模序列位置依赖，大幅提升了序列任务的建模效果。其核心功能与 RNN 一致（捕捉上下文依赖），但相比 RNN，注意力机制支持并行计算、擅长捕捉长距离依赖。Transformer 彻底舍弃循环结构，仅依靠注意力机制完成全局序列建模，印证了"Attention is All You Need"的核心思想。

### 整体结构

Transformer 也采用**编码器-解码器**（Encoder-Decoder）架构：
- **编码器**：负责对输入序列进行理解和表示
- **解码器**：根据编码器的输出逐步生成目标序列（自回归方式）

编码器和解码器分别由多个结构相同的层堆叠而成（标准 Transformer 为 6 层编码器 + 6 层解码器）。

![transformer整体结构](/images/llm-development/transformer整体结构.jpg)

### 编码器

每个编码器层（Encoder Layer）包含两个子层：

1. **自注意力子层（Self-Attention）**：捕捉序列中各位置之间的依赖关系
2. **前馈神经网络子层（Feed-Forward）**：对每个位置的表示进行非线性变换，提升表达能力

![transformer编码器](/images/llm-development/transformer编码器.jpg)

#### 自注意力层

**1. 自注意力计算过程**

(1) 生成 Query、Key、Value 向量：将输入序列中的每个位置映射为三个不同的向量。

![transformer-qkv向量](/images/llm-development/transformer-qkv向量.jpg)

(2) 计算位置间相关性：每个位置的 Query 与所有位置的 Key 进行相关性评分。

![transformer-位置相关性](/images/llm-development/transformer-位置相关性.jpg)

(3) 计算注意力权重：使用 Softmax 归一化为概率分布。

![transformer-注意力权重](/images/llm-development/transformer-注意力权重.jpg)

(4) 加权汇总生成输出：按注意力权重对所有位置的 Value 进行加权求和，得到融合全局信息的新表示。

![transformer-加权汇总生成输出](/images/llm-development/transformer-加权汇总生成输出.jpg)

**2. 多头自注意力（Multi-Head Attention）**

通过多组独立的 Query、Key、Value 投影，让不同注意力头分别专注于不同的语义关系，最后将各头的输出拼接融合。

#### 前馈神经网络层

前馈神经网络（FFN）紧接在多头注意力子层之后，对每个位置的表示进行逐位置、非线性特征变换，进一步提升模型对复杂语义的建模能力。

#### 残差连接与层归一化

每个子层的输出都经过残差连接和层归一化处理：

1. **残差连接**：`y = x + SubLayer(x)`，缓解梯度消失
2. **层归一化（LayerNorm）**：将每个 token 的向量调整为均值为 0、方差为 1 的规范分布，提升训练稳定性

![transformer-残差连接和层归一化](/images/llm-development/transformer-残差连接和层归一化.jpg)

#### 位置编码

Transformer 没有时序顺序感知能力，因此通过位置编码（Positional Encoding）给序列每个词注入位置时序信息，让模型能识别词语先后顺序与位置关系。

### 解码器

![transformer-解码器](/images/llm-development/transformer-解码器.jpg)

每个解码器层（Decoder Layer）包含三个子层：

![transformer-解码器拆解](/images/llm-development/transformer-解码器拆解.jpg)

1. **掩码自注意力子层（Masked Self-Attention）**：建模当前位置与前文词之间的依赖关系。使用遮盖机制（Mask），限制每个位置只能关注它前面的词，模拟逐词生成过程。

2. **编码器-解码器注意力子层（Encoder-Decoder Attention）**：建模当前解码位置与源序列各位置之间的依赖关系。Query 来自解码器，Key 和 Value 来自编码器输出。

![transformer-解码器-注意力子层](/images/llm-development/transformer-解码器-注意力子层.jpg)

3. **前馈神经网络子层**：与编码器中结构一致，增强表达能力。

每个子层后也配有残差连接与层归一化。解码器在输入端同样需要位置编码。在输出端，隐藏向量送入线性变换层映射为词表大小的向量，通过 Softmax 生成概率分布。

![transformer-解码器-残差连接层归一化](/images/llm-development/transformer-解码器-残差连接层归一化.jpg)

### GPT 架构

GPT 基于 Transformer 的解码器结构，但与标准 Transformer 解码器不完全相同：

1. **输入嵌入层**：Text Embedding（词向量）+ Position Embedding（位置向量）
2. **解码器**：12 层结构相同的解码器层堆叠，每层包含掩码多头自注意力（12 头）+ 前馈网络
3. **输出层**：
   - **Text Prediction（文本预测）**：用于下一个词的生成，输出词表大小的概率分布（预训练阶段使用）
   - **Task Classifier（任务分类器）**：用于模型微调阶段，提取特定位置的表示对整个输入文本进行分类（如情感分析）

![gpt架构](/images/llm-development/gpt架构.jpg)

## 8. 预训练

早期的自然语言处理方法通常针对每个具体任务单独训练模型，且严重依赖大量人工标注数据，存在明显局限：
1. 语言知识难以复用：每个模型都需从零开始训练，成本高、效率低
2. 强依赖高质量标注：医疗、法律等专业领域，标注数据获取困难且代价高昂

为解决这些问题，研究者提出了新的建模范式——**"预训练 + 微调"**：

1. **预训练阶段**：在大规模未标注语料上训练语言模型，学习词汇、句法和上下文等通用语言规律
2. **微调阶段**：将预训练模型迁移至具体任务，仅需少量标注数据即可完成任务适配

这一方法已成为当前 NLP 的主流技术路线，广泛应用于文本分类、问答系统、翻译、对话等任务中。

## 9. 参考资料与扩展阅读

### 经典论文

| 论文 | 作者 | 年份 | 说明 |
|------|------|------|------|
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Vaswani et al. | 2017 | Transformer 架构，NLP 里程碑 |
| [Efficient Estimation of Word Representations in Vector Space](https://arxiv.org/abs/1301.3781) | Mikolov et al. | 2013 | Word2Vec 词向量 |
| [Long Short-Term Memory](https://www.bioinf.jku.at/publications/older/2604.pdf) | Hochreiter & Schmidhuber | 1997 | LSTM 网络 |
| [BERT: Pre-training of Deep Bidirectional Transformers](https://arxiv.org/abs/1810.04805) | Devlin et al. | 2018 | BERT 双向预训练模型 |
| [Improving Language Understanding by Generative Pre-Training](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) | Radford et al. | 2018 | GPT-1 |
| [Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165) | Brown et al. | 2020 | GPT-3 大语言模型 |
| [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385) | He et al. | 2015 | ResNet 残差网络（CNN 参考） |
| [Sequence to Sequence Learning with Neural Networks](https://arxiv.org/abs/1409.3215) | Sutskever et al. | 2014 | Seq2Seq 框架 |
| [Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473) | Bahdanau et al. | 2014 | Attention 机制 |
| [Deep Speech 2](https://arxiv.org/abs/1512.02595) | Amodei et al. | 2015 | 端到端语音识别 |

### 学习资源

- **[HuggingFace NLP Course](https://huggingface.co/learn/nlp-course)**：最流行的 Transformers 入门教程
- **[Stanford CS224n](https://web.stanford.edu/class/cs224n/)**：斯坦福 NLP 深度学习课程
- **[Stanford CS231n](http://cs231n.stanford.edu/)**：斯坦福 CNN 视觉识别课程（CNN 参考）
- **[The Annotated Transformer](http://nlp.seas.harvard.edu/2018/04/03/attention.html)**：逐行解读 Transformer 代码
- **[d2l.ai (动手学深度学习)](https://d2l.ai/)**：理论 + 代码结合（含中文版 https://zh.d2l.ai/）
- **[LLM Visualization](https://bbycroft.net/llm)**：交互式 3D 可视化 GPT 推理过程
- **[Illustrated Transformer](http://jalammar.github.io/illustrated-transformer/)**：图解 Transformer（Jay Alammar）
- **[Illustrated BERT, ELMo, etc.](http://jalammar.github.io/illustrated-bert/)**：图解预训练模型系列
- **[The Matrix Calculus You Need For Deep Learning](https://arxiv.org/abs/1802.01528)**：深度学习中的矩阵微积分
- **[HuggingFace官网](https://huggingface.co/)**：HuggingFace官网
- **[国内镜像](https://hf-mirror.com/datasets)**：国内镜像
- **[HuggingFace教程](https://huggingface.co/docs/transformers/zh/quicktour)**：HuggingFace教程

### 开源工具与框架

- **[PyTorch](https://pytorch.org/)**：主流深度学习框架
- **[Transformers](https://github.com/huggingface/transformers)**：HuggingFace 的 Transformer 库
- **[TensorFlow](https://www.tensorflow.org/)**：Google 的深度学习框架
- **[spaCy](https://spacy.io/)**：工业级 NLP 库
- **[NLTK](https://www.nltk.org/)**：经典 NLP 工具包
- **[Jieba](https://github.com/fxsjy/jieba)**：中文分词库
- **[Gensim](https://radimrehurek.com/gensim/)**：主题建模和词向量工具
