tup.export("GOPATH")
tup.export("GIT_COMMIT")
tup.export("GIT_BRANCH")
tup.export("GIT_TAG")
tup.export("GIT_DIRTY")

tup.rule({"../util/assetbuilder/*", "../util/cedarish/<docker>"},
          "^ docker build installer-builder^ cat ../log/docker-cedarish.log > /dev/null && ../util/assetbuilder/build.sh image installer | tee %o",
          {"../log/docker-installer-builder.log", "<docker>"})

tup.rule("go build -o ../installer/bin/go-bindata ../Godeps/_workspace/src/github.com/jteeuwen/go-bindata/go-bindata",
          {"../installer/bin/go-bindata"})

tup.rule("go build -o ../installer/app/compiler ../installer/app",
          {"../installer/app/compiler"})

tup.rule({"../installer/bin/go-bindata", "../installer/app/compiler", "../log/docker-installer-builder.log"},
          "../util/assetbuilder/build.sh app installer",
          {"../installer/bindata.go"})

tup.rule({"tuf.go.tmpl"},
         "cat %f | sed 's|{{TUF-ROOT-KEYS}}|@(TUF_ROOT_KEYS)|' | sed 's|{{TUF-REPO}}|@(IMAGE_REPOSITORY)|' > %o",
         {"tuf.go"})

vpkg = "github.com/flynn/flynn/pkg/version"
for i, os in ipairs({"darwin", "linux", "windows"}) do
  for j, arch in ipairs({"amd64", "386"}) do
    tup.rule({"../installer/bindata.go", "tuf.go"},
             "^c go build %o^ GOOS="..os.." GOARCH="..arch.." CGO_ENABLED=0 ../util/_toolchain/go/bin/go build -installsuffix nocgo -o %o -ldflags=\"-X "..vpkg..".commit $GIT_COMMIT -X "..vpkg..".branch $GIT_BRANCH -X "..vpkg..".tag $GIT_TAG -X "..vpkg..".dirty $GIT_DIRTY\"",
             {string.format("bin/flynn-%s-%s", os, arch)})
  end
end

tup.rule({"bin/flynn-linux-amd64"}, "cp %f %o", {"bin/flynn"})
