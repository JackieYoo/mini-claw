# Git 指令速查表

> MiniClaw 项目实战版 - 快速查找常用指令

---

## 🚀 快速开始

```bash
# 初始化
git init                                    # 初始化仓库
git clone <url>                            # 克隆仓库

# 配置
git config --global user.name "名字"        # 设置用户名
git config --global user.email "邮箱"       # 设置邮箱
```

---

## 📦 提交代码

```bash
git status                                 # 查看状态
git status -s                              # 简洁模式

git add <file>                             # 添加文件
git add .                                  # 添加所有文件
git add -A                                 # 添加所有（包括删除）

git commit -m "提交信息"                    # 提交
git commit -am "提交信息"                   # 添加并提交
git commit --amend                         # 修改最后一次提交
```

---

## 🌿 分支操作

```bash
git branch                                 # 查看本地分支
git branch -a                              # 查看所有分支
git branch -vv                             # 查看分支详情

git branch <name>                          # 创建分支
git checkout -b <name>                     # 创建并切换
git switch -c <name>                       # 创建并切换（新版）

git checkout <name>                        # 切换分支
git switch <name>                          # 切换分支（新版）

git branch -d <name>                       # 删除分支
git branch -D <name>                       # 强制删除
```

---

## 🌐 远程仓库

```bash
git remote -v                              # 查看远程仓库
git remote add origin <url>                # 添加远程仓库
git remote set-url origin <url>            # 修改远程地址
git remote remove origin                   # 删除远程仓库

git push -u origin <branch>                # 推送并设置上游
git push                                   # 推送当前分支
git push --force                           # 强制推送（谨慎）

git pull origin <branch>                   # 拉取并合并
git fetch origin                           # 拉取不合并
```

---

## 📜 查看历史

```bash
git log                                    # 查看提交历史
git log --oneline                          # 单行显示
git log --oneline --graph --all            # 图形化显示

git diff                                   # 查看工作区差异
git diff --cached                          # 查看暂存区差异
git diff <branch1> <branch2>               # 比较分支差异

git show <commit>                          # 查看某次提交
```

---

## ⏪ 撤销操作

```bash
# 撤销工作区修改
git restore <file>                         # 撤销文件修改
git restore .                              # 撤销所有修改

# 撤销暂存
git restore --staged <file>                # 取消暂存

# 回退提交
git reset --soft HEAD^                     # 回退但保留修改
git reset --hard HEAD^                     # 回退并丢弃修改（危险）

# 撤销已推送的提交
git revert <commit>                        # 创建撤销提交
```

---

## 🔀 合并与变基

```bash
git merge <branch>                         # 合并分支
git merge --no-ff <branch>                 # 不使用快进模式

git rebase <branch>                        # 变基
git rebase --continue                      # 继续变基
git rebase --abort                         # 放弃变基
```

---

## 💾 暂存工作

```bash
git stash                                  # 暂存当前工作
git stash list                             # 查看暂存列表
git stash pop                              # 恢复并删除
git stash apply                            # 恢复但不删除
git stash drop                             # 删除暂存
```

---

## 🏷️ 标签管理

```bash
git tag                                    # 查看标签
git tag v1.0.0                             # 创建轻量标签
git tag -a v1.0.0 -m "说明"                # 创建附注标签
git push origin v1.0.0                     # 推送标签
git push --tags                            # 推送所有标签
git tag -d v1.0.0                          # 删除本地标签
```

---

## 📊 MiniClaw 实战案例

### 初始化项目

```bash
git init
git add .
git commit -m "feat: 初始化 MiniClaw 项目"
git branch -M main
git remote add origin git@github.com:JackieYoo/mini-claw.git
git push -u origin main
```

### 创建开发分支

```bash
git checkout -b develop
git push -u origin develop
```

### 日常开发

```bash
# 拉取最新代码
git pull origin develop

# 创建功能分支
git checkout -b feature/agent-router

# 开发并提交
git add .
git commit -m "feat: 添加 Agent 路由功能"

# 推送功能分支
git push -u origin feature/agent-router

# 合并回 develop
git checkout develop
git merge --no-ff feature/agent-router
git push origin develop
```

### 解决推送冲突

```bash
# 远程有新提交
git pull origin develop
# 解决冲突
git add .
git commit -m "merge: 合并远程更新"
git push origin develop
```

---

## 🎯 提交信息规范

```
feat:     新功能
fix:      修复bug
docs:     文档更新
style:    代码格式
refactor: 重构
test:     测试
chore:    构建/工具
perf:     性能优化

示例：
feat: 添加用户认证功能
fix: 修复登录页面样式问题
docs: 更新 API 文档
refactor: 优化数据库查询性能
```

---

## ⚠️ 危险操作

```bash
# 强制推送（覆盖远程）
git push --force

# 回退并丢弃修改
git reset --hard HEAD^

# 删除未合并的分支
git branch -D <branch>

# 清理未跟踪的文件
git clean -fd
```

---

## 🔍 调试技巧

```bash
# 查看文件修改历史
git log -p <file>

# 查看谁修改了这行代码
git blame <file>

# 二分查找定位问题
git bisect start
git bisect bad
git bisect good <commit>

# 查看引用日志
git reflog
```

---

## 📚 学习资源

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)
- [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)
- [GitHub Git 速查表](https://training.github.com/downloads/zh_CN/github-git-cheat-sheet/)

---

**记住：不确定时，先用 `git status` 查看状态！**
