# FastGPT升级指南

## 更新main分支

### 1. 切换到主分支
```bash
git checkout main
```
### 2. 获取原仓库最新代码
```bash
git fetch upstream
```
### 3. 合并原仓库代码到本地main分支
```bash
git merge upstream/main
```
### 4. 推送更新到自己的远程仓库
```bash
git push origin main
```
## 合并mp-fastgpt分支
### 1. 查看当前有哪些tag
```bash
git tag -l
```
### 2. 切换到mp-fastgpt分支
```bash
git checkout mp-fastgpt
```
### 3. 将[tag]合并mp-fastgpt分支
```bash
git merge v4.9.8
```
### 4. 推送更新到自己的远程仓库
```bash
git push origin mp-fastgpt
```
## 构建镜像
```bash
docker build -f ./projects/app/Dockerfile -t mp/fastgpt:v4.9.8 . --build-arg name=app --build-arg proxy=taobao
```
