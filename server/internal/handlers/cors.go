package handlers

import (
	"net/http"
	"strings"
)

// CORSMiddleware разрешает запросы фронтенду сайта: и с реального домена
// benzinopedia.ru (https, после переезда с самоподписанного/Let's Encrypt
// сертификата), и с GitHub Pages, и локально при разработке. Список origin'ов
// настраивается через переменную окружения CORS_ALLOWED_ORIGINS
// (через запятую); значение "*" разрешает любой origin — используется как
// простой фолбэк на первом этапе, как и обозначено в задаче.
type CORSMiddleware struct {
	allowedOrigins []string
	allowAll       bool
}

func NewCORSMiddleware(originsCSV string) *CORSMiddleware {
	m := &CORSMiddleware{}
	for _, o := range strings.Split(originsCSV, ",") {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		if o == "*" {
			m.allowAll = true
		}
		m.allowedOrigins = append(m.allowedOrigins, o)
	}
	return m
}

func (m *CORSMiddleware) isAllowed(origin string) bool {
	if m.allowAll {
		return true
	}
	for _, o := range m.allowedOrigins {
		if o == origin {
			return true
		}
	}
	return false
}

func (m *CORSMiddleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && m.isAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "3600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
