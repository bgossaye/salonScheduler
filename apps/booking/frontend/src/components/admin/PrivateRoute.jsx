import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const isLoggedIn = () => {
    const token = localStorage.getItem('adminToken');
    return !!token; // simple check
};

const PrivateRoute = () => {
    return isLoggedIn() ? <Outlet /> : <Navigate to="/admin/login" replace />;
};

export default PrivateRoute;
