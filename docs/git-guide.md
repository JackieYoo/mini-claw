# Git 指令使用指南 - MiniClaw 项目实战

> 本指南结合 MiniClaw 项目的实际操作，帮助你快速掌握 Git 常用指令

---

## 📚 目录

1. [初始化配置](#1-初始化配置)
2. [创建仓库](#2-创建仓库)
3. [分支管理](#3-分支管理)
4. [提交代码](#4-提交代码)
5. [远程仓库](#5-远程仓库)
6. [推送与拉取](#6-推送与拉取)
7. [查看状态](#7-查看状态)
8. [撤销与回退](#8-撤销与回退)
9. [合并分支](#9-合并分支)
10. [常见问题](#10-常见问题)

---

## 1. 初始化配置

### 设置用户信息

```bash
# 设置用户名
git config --global user.name "JackieYoo"

# 设置邮箱
git config --global user.email "youjunjie_scu@126.com"

# 查看配置
git config --list
```

### 配置 SSH 密钥（推荐）

```bash
# 生成 SSH 密钥（ed25519 算法）
ssh-keygen -t ed25519 -C "youjunjie_scu@126.com"

# 查看公钥（添加到 GitHub）
cat ~/.ssh/id_ed25519.pub

# 测试 SSH 连接
ssh -T git@github.com
```

**MiniClaw 实战：**
```bash
$ ssh -T git@github.com
Hi JackieYoo! You've successfully authenticated, but GitHub does not provide shell access.
# ✅ 表示 SSH 配置成功
```

---

## 2. 创建仓库

### 方式一：本地初始化

```bash
# 创建项目目录
mkdir mini-claw
cd mini-claw

# 初始化 Git 仓库
git init

# 创建 .gitignore 文件
cat > .gitignore << 'EOF'
node_modules/
.env
*.log
.DS_Store
EOF
```

### 方式二：克隆远程仓库

```bash
# HTTPS 方式
git clone https://github.com/JackieYoo/mini-claw.git

# SSH 方式（推荐）
git clone git@github.com:JackieYoo/mini-claw.git

# 克隆到指定目录
git clone git@github.com:JackieYoo/mini-claw.git my-project
```

**MiniClaw 实战：**
```bash
$ git init
Initialized empty Git repository in /Users/hljy/projects/mini-claw/.git/
```

---

## 3. 分支管理

### 查看分支

```bash
# 查看本地分支
git branch

# 查看所有分支（包括远程）
git branch -a

# 查看分支详细信息
git branch -vv
```

### 创建分支

```bash
# 创建新分支
git branch develop

# 创建并切换分支
git checkout -b develop

# 新版本推荐使用（Git 2.23+）
git switch -c develop
```

### 切换分支

```bash
# 切换到已有分支
git checkout develop

# 新版本推荐
git switch develop

# 切换到上一个分支
git switch -
```

### 删除分支

```bash
# 删除已合并的分支
git branch -d feature-xxx

# 强制删除未合并的分支
git branch -D feature-xxx

# 删除远程分支
git push origin --delete feature-xxx
```

**MiniClaw 实战：**
```bash
$ git checkout -b develop
Switched to a new branch 'develop'

$ git branch -vv
* develop 1112dbc [origin/develop] feat: 初始化 MiniClaw 项目
  main    1112dbc [origin/main] feat: 初始化 MiniClaw 项目
```

---

## 4. 提交代码

### 查看状态

```bash
# 查看工作区状态
git status

# 简洁模式
git status -s

# 查看修改内容
git diff
```

### 添加文件

```bash
# 添加单个文件
git add README.md

# 添加多个文件
git add file1.js file2.js

# 添加所有修改
git add .

# 添加所有文件（包括删除）
git add -A

# 交互式添加
git add -p
```

### 提交修改

```bash
# 提交暂存区的修改
git commit -m "feat: 添加用户认证功能"

# 提交并添加所有修改
git commit -am "fix: 修复登录bug"

# 修改最后一次提交
git commit --amend -m "新的提交信息"
```

### 提交规范（推荐）

```
feat:     新功能
fix:      修复bug
docs:     文档修改
style:    代码格式修改（不影响功能）
refactor: 代码重构
test:     测试相关
chore:    构建/工具相关
perf:     性能优化
```

**MiniClaw 实战：**
```bash
$ git status
On branch develop
Changes not staged for commit:
  modified:   src/gateway/index.js
  modified:   src/utils/session.js

Untracked files:
  config/agents.yaml
  src/agent/factory.js
  src/agent/router.js

$ git add .
$ git commit -m "feat: 添加 Agent 路由功能"
```

---

## 5. 远程仓库

### 添加远程仓库

```bash
# 添加远程仓库
git remote add origin git@github.com:JackieYoo/mini-claw.git

# 查看远程仓库
git remote -v

# 修改远程仓库地址
git remote set-url origin git@github.com:JackieYoo/mini-claw.git

# 删除远程仓库
git remote remove origin
```

### 查看远程信息

```bash
# 查看详细信息
git remote show origin

# 查看远程分支
git branch -r

# 查看所有分支
git branch -a
```

**MiniClaw 实战：**
```bash
# 先添加 HTTPS 地址（失败）
$ git remote add origin https://github.com/JackieYoo/mini-claw.git

# 改为 SSH 地址（成功）
$ git remote set-url origin git@github.com:JackieYoo/mini-claw.git

$ git remote -v
origin  git@github.com:JackieYoo/mini-claw.git (fetch)
origin  git@github.com:JackieYoo/mini-claw.git (push)
```

---

## 6. 推送与拉取

### 推送代码

```bash
# 推送当前分支
git push

# 推送并设置上游分支
git push -u origin develop

# 推送所有分支
git push --all origin

# 强制推送（谨慎使用）
git push --force origin main

# 推送标签
git push --tags
```

### 拉取代码

```bash
# 拉取并合并
git pull origin develop

# 拉取但不合并（推荐）
git fetch origin

# 查看远程更新
git log origin/develop

# 合并远程分支
git merge origin/develop
```

### fetch vs pull

```bash
# git pull = git fetch + git merge
# 推荐使用 fetch，更安全

git fetch origin        # 获取远程更新
git diff origin/develop # 查看差异
git merge origin/develop # 确认后合并
```

**MiniClaw 实战：**
```bash
# 推送 develop 分支
$ git push -u origin develop
To github.com:JackieYoo/mini-claw.git
 * [new branch]      develop -> develop
branch 'develop' set up to track 'origin/develop'

# 强制推送 main 分支（覆盖远程）
$ git push origin main --force
To github.com:JackieYoo/mini-claw.git
 + deaecdd...1112dbc main -> main (forced update)
```

---

## 7. 查看状态

### 查看提交历史

```bash
# 查看提交历史
git log

# 单行显示
git log --oneline

# 图形化显示
git log --oneline --graph --all

# 查看最近3次提交
git log -3

# 查看某个文件的修改历史
git log -p src/gateway/index.js
```

### 查看差异

```bash
# 查看工作区和暂存区的差异
git diff

# 查看暂存区和最新提交的差异
git diff --cached

# 查看两个分支的差异
git diff main develop

# 查看两个提交的差异
git diff commit1 commit2

# 只看文件名
git diff --name-only
```

### 查看文件内容

```bash
# 查看某个提交的文件内容
git show commit-id:src/index.js

# 查看某次提交的修改
git show commit-id
```

**MiniClaw 实战：**
```bash
$ git log --oneline
1112dbc feat: 初始化 MiniClaw 项目 - 精简版 AI 助手框架

$ git diff --stat
 src/gateway/index.js | 10 +++++++++-
 src/utils/session.js |  5 ++++-
 2 files changed, 13 insertions(+), 2 deletions(-)
```

---

## 8. 撤销与回退

### 撤销工作区修改

```bash
# 撤销单个文件的修改
git restore src/index.js

# 或使用旧命令
git checkout -- src/index.js

# 撤销所有修改
git restore .
```

### 撤销暂存区

```bash
# 取消暂存（保留工作区修改）
git restore --staged src/index.js

# 或使用旧命令
git reset HEAD src/index.js
```

### 回退提交

```bash
# 回退到上一个提交（保留修改）
git reset --soft HEAD^

# 回退到上一个提交（取消暂存）
git reset --mixed HEAD^

# 回退到上一个提交（丢弃修改，危险）
git reset --hard HEAD^

# 回退到指定提交
git reset --hard commit-id
```

### 撤销已推送的提交

```bash
# 创建新提交来撤销
git revert commit-id

# 推送撤销
git push origin develop
```

**reset vs revert：**
- `reset`：回退历史，适合未推送的提交
- `revert`：创建新提交来撤销，适合已推送的提交

---

## 9. 合并分支

### 合并分支

```bash
# 切换到目标分支
git checkout main

# 合并 develop 分支
git merge develop

# 不使用快进模式（保留分支历史）
git merge --no-ff develop
```

### 解决冲突

```bash
# 1. 查看冲突文件
git status

# 2. 手动编辑冲突文件
# <<<<<<< HEAD
# 当前分支的内容
# =======
# 要合并分支的内容
# >>>>>>> develop

# 3. 标记为已解决
git add 冲突文件

# 4. 完成合并
git commit
```

### 变基（Rebase）

```bash
# 将当前分支变基到 main
git rebase main

# 解决冲突后继续
git rebase --continue

# 放弃变基
git rebase --abort
```

**merge vs rebase：**
- `merge`：保留分支历史，适合公共分支
- `rebase`：线性历史，适合本地分支

---

## 10. 常见问题

### 问题1：推送被拒绝

```bash
$ git push
! [rejected] main -> main (fetch first)

# 解决方案1：先拉取再推送
git pull origin main
git push origin main

# 解决方案2：强制推送（确保远程提交不重要）
git push --force origin main
```

**MiniClaw 案例：**
```bash
# GitHub 自动创建了 Initial commit，与本地不同
$ git push origin main
! [rejected] main -> main (fetch first)

# 强制推送覆盖
$ git push origin main --force
```

### 问题2：忘记切换分支就提交了

```bash
# 1. 撤销提交（保留修改）
git reset --soft HEAD^

# 2. 暂存修改
git stash

# 3. 切换分支
git checkout develop

# 4. 恢复修改
git stash pop

# 5. 重新提交
git commit -m "xxx"
```

### 问题3：提交信息写错了

```bash
# 修改最后一次提交信息
git commit --amend -m "正确的提交信息"

# 修改已推送的提交信息（需要强制推送）
git commit --amend -m "正确的提交信息"
git push --force origin develop
```

### 问题4：文件太大无法推送

```bash
# 使用 Git LFS
git lfs install
git lfs track "*.psd"
git add .gitattributes
git commit -m "配置 Git LFS"
```

### 问题5：删除已提交的敏感文件

```bash
# 从历史中完全删除
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# 强制推送
git push origin --force --all
```

---

## 🎯 MiniClaw 项目完整流程

### 初始化到推送的完整过程

```bash
# 1. 初始化仓库
cd ~/projects/mini-claw
git init

# 2. 创建 .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
*.log
.DS_Store
EOF

# 3. 添加所有文件
git add .

# 4. 创建初始提交
git commit -m "feat: 初始化 MiniClaw 项目 - 精简版 AI 助手框架"

# 5. 创建 develop 分支
git checkout -b develop

# 6. 添加远程仓库
git remote add origin git@github.com:JackieYoo/mini-claw.git

# 7. 推送 develop 分支
git push -u origin develop

# 8. 推送 main 分支
git push -u origin main

# 9. 查看状态
git branch -vv
```

### 日常开发流程

```bash
# 1. 切换到开发分支
git checkout develop

# 2. 拉取最新代码
git pull origin develop

# 3. 创建功能分支
git checkout -b feature/agent-router

# 4. 开发并提交
git add .
git commit -m "feat: 添加 Agent 路由功能"

# 5. 推送功能分支
git push -u origin feature/agent-router

# 6. 在 GitHub 创建 Pull Request

# 7. 合并后删除功能分支
git checkout develop
git pull origin develop
git branch -d feature/agent-router
git push origin --delete feature/agent-router
```

---

## 📖 Git 工作流推荐

### Git Flow 模型

```
master (main)  ──●────●────●────●──  生产环境
                 \         /
develop        ───●──●──●──●──●────  开发环境
                    \    /
feature/xxx    ─────●──●──────────  功能分支
```

### 分支命名规范

```
main/master      主分支（生产环境）
develop          开发分支
feature/xxx      功能分支
bugfix/xxx       修复分支
release/x.x.x    发布分支
hotfix/xxx       紧急修复分支
```

---

## 🔗 常用资源

- [Git 官方文档](https://git-scm.com/doc)
- [Pro Git 电子书](https://git-scm.com/book/zh/v2)
- [GitHub Git Cheat Sheet](https://training.github.com/downloads/zh_CN/github-git-cheat-sheet/)
- [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)（可视化学习）

---

## 💡 最佳实践

1. **提交前检查**
   ```bash
   git status
   git diff
   ```

2. **频繁提交，小步快跑**
   - 每个提交只做一件事
   - 提交信息清晰明确

3. **推送前拉取**
   ```bash
   git pull --rebase origin develop
   ```

4. **使用分支开发新功能**
   - 不要直接在 main/develop 上开发
   - 功能分支开发完成后合并

5. **保持提交历史整洁**
   - 使用 `git rebase -i` 整理提交
   - 合并前确保代码质量

6. **保护重要分支**
   - 在 GitHub 设置分支保护规则
   - 需要 PR 审核才能合并

---

**最后更新：2024年**
