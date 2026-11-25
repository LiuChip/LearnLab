# LearnLab 宿主验证插件

此插件是本地开发夹具。它读取已授权的实验包摘要，再请求额外的章节能力并检查宿主拒绝。自动化测试会通过真实子进程启动它。

手动验证时，将本目录复制到开发实例的 LearnLab 数据目录下的 `plugins/`，在测试包清单的 `required_plugins` 中加入 `org.learnlab.host-check` 和版本 `1.0.0`，并在任一章节加入以下实验。

````markdown
```lab
id: verify-host
title: 验证插件宿主
type: auto
experiment_type: host-check
permissions:
  read: [package.manifest]
```
````

运行实验后，在通知中选择允许，再到执行历史查看两个检查项。
